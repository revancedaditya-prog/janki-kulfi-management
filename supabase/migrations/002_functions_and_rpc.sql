-- Janki Kulfi Management Migration 002
-- Transactional Database Functions and Stored Procedures

-- Helper: Get or Create Location ID by Type and Seller
CREATE OR REPLACE FUNCTION get_or_create_stock_location(
  p_location_type stock_location_type,
  p_seller_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_location_id UUID;
  v_seller_name TEXT;
BEGIN
  IF p_location_type = 'seller' THEN
    SELECT id INTO v_location_id FROM stock_locations WHERE seller_id = p_seller_id AND location_type = 'seller' LIMIT 1;
    IF v_location_id IS NULL THEN
      SELECT full_name INTO v_seller_name FROM sellers WHERE id = p_seller_id;
      INSERT INTO stock_locations (location_type, name, seller_id, is_active)
      VALUES ('seller', COALESCE(v_seller_name, 'Seller') || ' Cart Stock', p_seller_id, true)
      RETURNING id INTO v_location_id;
    END IF;
  ELSE
    SELECT id INTO v_location_id FROM stock_locations WHERE location_type = p_location_type LIMIT 1;
    IF v_location_id IS NULL THEN
      INSERT INTO stock_locations (location_type, name, is_active)
      VALUES (p_location_type, COALESCE(p_name, INITCAP(REPLACE(p_location_type::TEXT, '_', ' '))), true)
      RETURNING id INTO v_location_id;
    END IF;
  END IF;
  RETURN v_location_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Complete Production Batch
CREATE OR REPLACE FUNCTION complete_production_batch(
  p_batch_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_total_saleable INTEGER := 0;
  v_total_cost NUMERIC(12,2) := 0;
BEGIN
  -- Validate Batch
  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found';
  END IF;

  IF v_batch.status = 'completed' THEN
    RAISE EXCEPTION 'Batch is already completed';
  END IF;

  IF v_batch.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete a cancelled batch';
  END IF;

  -- Ensure Locations exist
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');

  -- Process Items
  FOR v_item IN SELECT * FROM production_items WHERE batch_id = p_batch_id FOR UPDATE LOOP
    IF v_item.produced_quantity < 0 OR v_item.damaged_quantity < 0 THEN
      RAISE EXCEPTION 'Quantities cannot be negative';
    END IF;
    IF v_item.damaged_quantity > v_item.produced_quantity THEN
      RAISE EXCEPTION 'Damaged quantity cannot exceed produced quantity';
    END IF;

    -- Update calculated saleable quantity
    UPDATE production_items
    SET saleable_quantity = v_item.produced_quantity - v_item.damaged_quantity,
        unit_production_cost = CASE WHEN (v_item.produced_quantity - v_item.damaged_quantity) > 0 
          THEN ROUND(v_item.allocated_ingredient_cost / (v_item.produced_quantity - v_item.damaged_quantity), 2)
          ELSE 0.00 END
    WHERE id = v_item.id;

    -- Create stock movement for saleable stock into Main Freezer
    IF (v_item.produced_quantity - v_item.damaged_quantity) > 0 THEN
      INSERT INTO stock_movements (
        product_id,
        source_location_id,
        destination_location_id,
        quantity,
        movement_type,
        reference_table,
        reference_id,
        notes,
        created_by
      ) VALUES (
        v_item.product_id,
        v_prod_loc_id,
        v_freezer_loc_id,
        v_item.produced_quantity - v_item.damaged_quantity,
        'production_completed',
        'production_batches',
        p_batch_id,
        'Batch completed: ' || v_batch.batch_number,
        p_user_id
      );
    END IF;

    -- If damaged during production, record to damaged stock location
    IF v_item.damaged_quantity > 0 THEN
      INSERT INTO stock_movements (
        product_id,
        source_location_id,
        destination_location_id,
        quantity,
        movement_type,
        reference_table,
        reference_id,
        notes,
        created_by
      ) VALUES (
        v_item.product_id,
        v_prod_loc_id,
        get_or_create_stock_location('damaged', NULL, 'Damaged Stock'),
        v_item.damaged_quantity,
        'damaged',
        'production_batches',
        p_batch_id,
        'Production wastage in batch: ' || v_batch.batch_number,
        p_user_id
      );
    END IF;

    v_total_saleable := v_total_saleable + (v_item.produced_quantity - v_item.damaged_quantity);
  END LOOP;

  -- Update Batch Status
  UPDATE production_batches
  SET status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_batch_id;

  -- Log Audit
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'production_batches',
    p_batch_id,
    'COMPLETE_PRODUCTION',
    row_to_json(v_batch)::jsonb,
    jsonb_build_object('status', 'completed', 'total_saleable', v_total_saleable),
    'Production batch completed and moved to freezer',
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'total_saleable', v_total_saleable);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Issue Seller Stock (with safe stock validation & price snapshots)
CREATE OR REPLACE FUNCTION issue_seller_stock(
  p_seller_id UUID,
  p_cart_id UUID,
  p_issue_date DATE,
  p_items JSONB, -- Array of { product_id, issued_quantity }
  p_notes TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_issue_id UUID;
  v_issue_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_available_qty INTEGER;
  v_price RECORD;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_today_code TEXT;
  v_seq INTEGER;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot create an empty stock issue. At least one product is required.';
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', p_seller_id);

  -- Generate readable issue number: IS-YYYYMMDD-001
  v_today_code := 'IS-' || TO_CHAR(COALESCE(p_issue_date, CURRENT_DATE), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_seq FROM seller_issues WHERE issue_number LIKE v_today_code || '%';
  v_issue_number := v_today_code || '-' || LPAD(v_seq::TEXT, 3, '0');

  -- Create Issue Header
  INSERT INTO seller_issues (
    issue_number,
    seller_id,
    cart_id,
    issue_date,
    status,
    issued_at,
    notes,
    created_by
  ) VALUES (
    v_issue_number,
    p_seller_id,
    p_cart_id,
    COALESCE(p_issue_date, CURRENT_DATE),
    'issued',
    NOW(),
    p_notes,
    p_user_id
  ) RETURNING id INTO v_issue_id;

  -- Process and Validate each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'issued_quantity')::INTEGER;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Issued quantity must be greater than zero';
    END IF;

    -- Validate Available Freezer Stock
    SELECT available_quantity INTO v_available_qty 
    FROM v_freezer_stock 
    WHERE product_id = v_product_id;

    IF v_available_qty IS NULL OR v_available_qty < v_quantity THEN
      RAISE EXCEPTION 'Insufficient freezer stock for product % (Available: %, Requested: %)', 
        v_product_id, COALESCE(v_available_qty, 0), v_quantity;
    END IF;

    -- Get Active Price and Commission Snapshot
    SELECT selling_price, commission_type, commission_value INTO v_price
    FROM product_prices
    WHERE product_id = v_product_id
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active price configuration found for product %', v_product_id;
    END IF;

    -- Insert Issue Item with Snapshots
    INSERT INTO seller_issue_items (
      seller_issue_id,
      product_id,
      issued_quantity,
      unit_selling_price_snapshot,
      commission_type_snapshot,
      commission_value_snapshot
    ) VALUES (
      v_issue_id,
      v_product_id,
      v_quantity,
      v_price.selling_price,
      v_price.commission_type::TEXT,
      v_price.commission_value
    );

    -- Record Authoritative Stock Movement from Freezer to Seller
    INSERT INTO stock_movements (
      product_id,
      source_location_id,
      destination_location_id,
      quantity,
      movement_type,
      reference_table,
      reference_id,
      notes,
      created_by
    ) VALUES (
      v_product_id,
      v_freezer_loc_id,
      v_seller_loc_id,
      v_quantity,
      'seller_issued',
      'seller_issues',
      v_issue_id,
      'Stock issue: ' || v_issue_number,
      p_user_id
    );
  END LOOP;

  -- Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'seller_issues',
    v_issue_id,
    'ISSUE_SELLER_STOCK',
    jsonb_build_object('issue_number', v_issue_number, 'seller_id', p_seller_id, 'items', p_items),
    'Stock issued to seller',
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'issue_id', v_issue_id, 'issue_number', v_issue_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Submit or Approve Seller Settlement (Atomically calculates sales, commission, collection, returns & damage)
CREATE OR REPLACE FUNCTION process_seller_settlement(
  p_seller_issue_id UUID,
  p_settlement_date DATE,
  p_items JSONB, -- Array of { issue_item_id, returned_qty, damaged_qty, comp_qty, damage_reason, comp_reason }
  p_cash NUMERIC(12,2),
  p_upi NUMERIC(12,2),
  p_credit NUMERIC(12,2),
  p_notes TEXT,
  p_is_approved_by_owner BOOLEAN,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_issue RECORD;
  v_settlement_id UUID;
  v_settlement_number TEXT;
  v_item JSONB;
  v_issue_item RECORD;
  v_returned INT;
  v_damaged INT;
  v_comp INT;
  v_sold INT;
  v_item_gross NUMERIC(12,2);
  v_item_commission NUMERIC(12,2);
  v_tot_gross NUMERIC(12,2) := 0.00;
  v_tot_commission NUMERIC(12,2) := 0.00;
  v_expected_collection NUMERIC(12,2) := 0.00;
  v_total_received NUMERIC(12,2) := 0.00;
  v_accounted_amount NUMERIC(12,2) := 0.00;
  v_diff NUMERIC(12,2) := 0.00;
  v_shortage NUMERIC(12,2) := 0.00;
  v_outstanding NUMERIC(12,2) := 0.00;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_damaged_loc_id UUID;
  v_comp_loc_id UUID;
  v_today_code TEXT;
  v_seq INT;
  v_status settlement_status;
BEGIN
  -- Validate Issue
  SELECT * INTO v_issue FROM seller_issues WHERE id = p_seller_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock issue not found';
  END IF;

  IF v_issue.status = 'settled' THEN
    RAISE EXCEPTION 'This issue is already fully settled';
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_issue.seller_id);
  v_damaged_loc_id := get_or_create_stock_location('damaged');
  v_comp_loc_id := get_or_create_stock_location('complimentary');

  -- Generate Settlement Number: ST-YYYYMMDD-001
  v_today_code := 'ST-' || TO_CHAR(COALESCE(p_settlement_date, CURRENT_DATE), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_seq FROM seller_settlements WHERE settlement_number LIKE v_today_code || '%';
  v_settlement_number := v_today_code || '-' || LPAD(v_seq::TEXT, 3, '0');

  v_status := CASE WHEN p_is_approved_by_owner THEN 'approved'::settlement_status ELSE 'pending_approval'::settlement_status END;

  -- Create Settlement Draft Header
  INSERT INTO seller_settlements (
    settlement_number,
    seller_issue_id,
    seller_id,
    settlement_date,
    status,
    cash_received,
    upi_received,
    credit_amount,
    gross_sales,
    total_commission,
    expected_collection,
    total_received,
    outstanding_amount,
    shortage_amount,
    notes,
    submitted_by,
    approved_by,
    submitted_at,
    approved_at
  ) VALUES (
    v_settlement_number,
    p_seller_issue_id,
    v_issue.seller_id,
    COALESCE(p_settlement_date, CURRENT_DATE),
    v_status,
    COALESCE(p_cash, 0.00),
    COALESCE(p_upi, 0.00),
    COALESCE(p_credit, 0.00),
    0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
    p_notes,
    p_user_id,
    CASE WHEN p_is_approved_by_owner THEN p_user_id ELSE NULL END,
    NOW(),
    CASE WHEN p_is_approved_by_owner THEN NOW() ELSE NULL END
  ) RETURNING id INTO v_settlement_id;

  -- Process Items and Calculate Server-Side Totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_issue_item 
    FROM seller_issue_items 
    WHERE id = (v_item->>'issue_item_id')::UUID AND seller_issue_id = p_seller_issue_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Issue item % does not match issue %', (v_item->>'issue_item_id'), p_seller_issue_id;
    END IF;

    v_returned := COALESCE((v_item->>'returned_qty')::INT, 0);
    v_damaged := COALESCE((v_item->>'damaged_qty')::INT, 0);
    v_comp := COALESCE((v_item->>'comp_qty')::INT, 0);

    IF v_returned < 0 OR v_damaged < 0 OR v_comp < 0 THEN
      RAISE EXCEPTION 'Returned, damaged and complimentary quantities cannot be negative';
    END IF;

    IF (v_returned + v_damaged + v_comp) > v_issue_item.issued_quantity THEN
      RAISE EXCEPTION 'Total of return, damage, and complimentary (%) cannot exceed issued quantity (%) for product %',
        (v_returned + v_damaged + v_comp), v_issue_item.issued_quantity, v_issue_item.product_id;
    END IF;

    -- Require reasons if damage or complimentary is recorded
    IF v_damaged > 0 AND (v_item->>'damage_reason' IS NULL OR length(trim(v_item->>'damage_reason')) = 0) THEN
      RAISE EXCEPTION 'Damage reason is required when damaged quantity > 0';
    END IF;
    IF v_comp > 0 AND (v_item->>'comp_reason' IS NULL OR length(trim(v_item->>'comp_reason')) = 0) THEN
      RAISE EXCEPTION 'Complimentary reason is required when complimentary quantity > 0';
    END IF;

    -- Sold Quantity calculation
    v_sold := v_issue_item.issued_quantity - (v_returned + v_damaged + v_comp);
    v_item_gross := v_sold * v_issue_item.unit_selling_price_snapshot;

    -- Commission calculation
    IF v_issue_item.commission_type_snapshot = 'percentage' THEN
      v_item_commission := ROUND((v_item_gross * v_issue_item.commission_value_snapshot) / 100.0, 2);
    ELSE
      v_item_commission := v_sold * v_issue_item.commission_value_snapshot;
    END IF;

    v_tot_gross := v_tot_gross + v_item_gross;
    v_tot_commission := v_tot_commission + v_item_commission;

    -- Insert Settlement Item
    INSERT INTO settlement_items (
      settlement_id,
      seller_issue_item_id,
      product_id,
      issued_quantity_snapshot,
      returned_quantity,
      damaged_quantity,
      complimentary_quantity,
      sold_quantity,
      selling_price_snapshot,
      gross_sales,
      commission_amount,
      damage_reason,
      complimentary_reason
    ) VALUES (
      v_settlement_id,
      v_issue_item.id,
      v_issue_item.product_id,
      v_issue_item.issued_quantity,
      v_returned,
      v_damaged,
      v_comp,
      v_sold,
      v_issue_item.unit_selling_price_snapshot,
      v_item_gross,
      v_item_commission,
      v_item->>'damage_reason',
      v_item->>'comp_reason'
    );

    -- If approved immediately by Owner, commit stock movements
    IF p_is_approved_by_owner THEN
      -- Unsold returned stock moves back to Main Freezer
      IF v_returned > 0 THEN
        INSERT INTO stock_movements (
          product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          v_issue_item.product_id, v_seller_loc_id, v_freezer_loc_id, v_returned, 'seller_returned', 'seller_settlements', v_settlement_id, 'Returned to freezer: ' || v_settlement_number, p_user_id
        );
      END IF;

      -- Damaged stock moves to damaged stock location
      IF v_damaged > 0 THEN
        INSERT INTO stock_movements (
          product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          v_issue_item.product_id, v_seller_loc_id, v_damaged_loc_id, v_damaged, 'damaged', 'seller_settlements', v_settlement_id, 'Seller damaged: ' || COALESCE(v_item->>'damage_reason', ''), p_user_id
        );
      END IF;

      -- Complimentary pieces move to complimentary location
      IF v_comp > 0 THEN
        INSERT INTO stock_movements (
          product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          v_issue_item.product_id, v_seller_loc_id, v_comp_loc_id, v_comp, 'complimentary', 'seller_settlements', v_settlement_id, 'Complimentary: ' || COALESCE(v_item->>'comp_reason', ''), p_user_id
        );
      END IF;
    END IF;
  END LOOP;

  -- Financial Calculations
  v_expected_collection := GREATEST(0.00, v_tot_gross - v_tot_commission);
  v_total_received := COALESCE(p_cash, 0.00) + COALESCE(p_upi, 0.00);
  v_accounted_amount := v_total_received + COALESCE(p_credit, 0.00);
  v_diff := v_accounted_amount - v_expected_collection;

  IF v_diff < 0 THEN
    v_shortage := ABS(v_diff);
  ELSE
    v_shortage := 0.00;
  END IF;

  v_outstanding := COALESCE(p_credit, 0.00) + v_shortage;

  -- Update Settlement Header with Server Calculated Totals
  UPDATE seller_settlements
  SET gross_sales = v_tot_gross,
      total_commission = v_tot_commission,
      expected_collection = v_expected_collection,
      total_received = v_total_received,
      outstanding_amount = v_outstanding,
      shortage_amount = v_shortage,
      updated_at = NOW()
  WHERE id = v_settlement_id;

  IF p_is_approved_by_owner THEN
    UPDATE seller_issues SET status = 'settled', updated_at = NOW() WHERE id = p_seller_issue_id;
  ELSE
    UPDATE seller_issues SET status = 'partially_settled', updated_at = NOW() WHERE id = p_seller_issue_id;
  END IF;

  -- Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'seller_settlements',
    v_settlement_id,
    CASE WHEN p_is_approved_by_owner THEN 'APPROVE_SETTLEMENT' ELSE 'SUBMIT_SETTLEMENT' END,
    jsonb_build_object('settlement_number', v_settlement_number, 'gross_sales', v_tot_gross, 'status', v_status),
    'Seller settlement processed',
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'settlement_number', v_settlement_number,
    'gross_sales', v_tot_gross,
    'total_commission', v_tot_commission,
    'expected_collection', v_expected_collection,
    'total_received', v_total_received,
    'shortage_amount', v_shortage,
    'status', v_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Approve Pending Settlement (Owner Approval)
CREATE OR REPLACE FUNCTION approve_pending_settlement(
  p_settlement_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_settlement RECORD;
  v_item RECORD;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_damaged_loc_id UUID;
  v_comp_loc_id UUID;
BEGIN
  SELECT * INTO v_settlement FROM seller_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found';
  END IF;

  IF v_settlement.status = 'approved' THEN
    RAISE EXCEPTION 'Settlement is already approved';
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_settlement.seller_id);
  v_damaged_loc_id := get_or_create_stock_location('damaged');
  v_comp_loc_id := get_or_create_stock_location('complimentary');

  -- Move stock for each settlement item
  FOR v_item IN SELECT * FROM settlement_items WHERE settlement_id = p_settlement_id LOOP
    IF v_item.returned_quantity > 0 THEN
      INSERT INTO stock_movements (
        product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        v_item.product_id, v_seller_loc_id, v_freezer_loc_id, v_item.returned_quantity, 'seller_returned', 'seller_settlements', p_settlement_id, 'Returned stock: ' || v_settlement.settlement_number, p_user_id
      );
    END IF;

    IF v_item.damaged_quantity > 0 THEN
      INSERT INTO stock_movements (
        product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        v_item.product_id, v_seller_loc_id, v_damaged_loc_id, v_item.damaged_quantity, 'damaged', 'seller_settlements', p_settlement_id, 'Damaged stock approved: ' || COALESCE(v_item.damage_reason, ''), p_user_id
      );
    END IF;

    IF v_item.complimentary_quantity > 0 THEN
      INSERT INTO stock_movements (
        product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        v_item.product_id, v_seller_loc_id, v_comp_loc_id, v_item.complimentary_quantity, 'complimentary', 'seller_settlements', p_settlement_id, 'Complimentary approved: ' || COALESCE(v_item.complimentary_reason, ''), p_user_id
      );
    END IF;
  END LOOP;

  -- Update Settlement Status
  UPDATE seller_settlements
  SET status = 'approved',
      approved_by = p_user_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_settlement_id;

  -- Update Issue Status
  UPDATE seller_issues
  SET status = 'settled',
      updated_at = NOW()
  WHERE id = v_settlement.seller_issue_id;

  -- Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'seller_settlements',
    p_settlement_id,
    'APPROVE_SETTLEMENT',
    row_to_json(v_settlement)::jsonb,
    jsonb_build_object('status', 'approved', 'approved_by', p_user_id),
    'Owner approved settlement',
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'settlement_id', p_settlement_id, 'status', 'approved');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Close Business Day (Strict pre-closing validations & profit calculation)
CREATE OR REPLACE FUNCTION close_business_day(
  p_business_date DATE,
  p_notes TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_unsettled_count INT;
  v_draft_batch_count INT;
  v_pending_settlement_count INT;
  v_tot_produced INT := 0;
  v_tot_sold INT := 0;
  v_tot_returned INT := 0;
  v_tot_damaged INT := 0;
  v_tot_comp INT := 0;
  v_gross_sales NUMERIC(12,2) := 0.00;
  v_tot_commission NUMERIC(12,2) := 0.00;
  v_net_sales NUMERIC(12,2) := 0.00;
  v_cash_received NUMERIC(12,2) := 0.00;
  v_upi_received NUMERIC(12,2) := 0.00;
  v_credit_sales NUMERIC(12,2) := 0.00;
  v_tot_expenses NUMERIC(12,2) := 0.00;
  v_tot_ingredient_cost NUMERIC(12,2) := 0.00;
  v_estimated_profit NUMERIC(12,2) := 0.00;
  v_closing_stock_val NUMERIC(12,2) := 0.00;
  v_closing_id UUID;
  v_existing RECORD;
BEGIN
  -- 1. Pre-closing Blocking Checks
  SELECT COUNT(*) INTO v_draft_batch_count 
  FROM production_batches 
  WHERE production_date = p_business_date AND status = 'draft';

  IF v_draft_batch_count > 0 THEN
    RAISE EXCEPTION 'Cannot close day. There are % draft production batches that must be completed or cancelled first.', v_draft_batch_count;
  END IF;

  SELECT COUNT(*) INTO v_unsettled_count 
  FROM seller_issues 
  WHERE issue_date = p_business_date AND status IN ('issued', 'partially_settled');

  IF v_unsettled_count > 0 THEN
    RAISE EXCEPTION 'Cannot close day. There are % unsettled seller issues for this date.', v_unsettled_count;
  END IF;

  SELECT COUNT(*) INTO v_pending_settlement_count
  FROM seller_settlements
  WHERE settlement_date = p_business_date AND status = 'pending_approval';

  IF v_pending_settlement_count > 0 THEN
    RAISE EXCEPTION 'Cannot close day. There are % settlements awaiting owner approval.', v_pending_settlement_count;
  END IF;

  -- 2. Aggregate Production for the day
  SELECT 
    COALESCE(SUM(pi.produced_quantity), 0),
    COALESCE(SUM(pb.total_ingredient_cost), 0)
  INTO v_tot_produced, v_tot_ingredient_cost
  FROM production_batches pb
  JOIN production_items pi ON pb.id = pi.batch_id
  WHERE pb.production_date = p_business_date AND pb.status = 'completed';

  -- 3. Aggregate Approved Settlements for the day
  SELECT
    COALESCE(SUM(si.sold_quantity), 0),
    COALESCE(SUM(si.returned_quantity), 0),
    COALESCE(SUM(si.damaged_quantity), 0),
    COALESCE(SUM(si.complimentary_quantity), 0),
    COALESCE(SUM(ss.gross_sales), 0.00),
    COALESCE(SUM(ss.total_commission), 0.00),
    COALESCE(SUM(ss.cash_received), 0.00),
    COALESCE(SUM(ss.upi_received), 0.00),
    COALESCE(SUM(ss.credit_amount), 0.00)
  INTO 
    v_tot_sold,
    v_tot_returned,
    v_tot_damaged,
    v_tot_comp,
    v_gross_sales,
    v_tot_commission,
    v_cash_received,
    v_upi_received,
    v_credit_sales
  FROM seller_settlements ss
  JOIN settlement_items si ON ss.id = si.settlement_id
  WHERE ss.settlement_date = p_business_date AND ss.status = 'approved';

  v_net_sales := v_gross_sales - v_tot_commission;

  -- 4. Aggregate Active Operating Expenses (excluding seller commission if already accounted)
  SELECT COALESCE(SUM(amount), 0.00) INTO v_tot_expenses
  FROM expenses
  WHERE expense_date = p_business_date 
    AND status = 'active'
    AND category != 'seller_commission'; -- Avoid double counting commission

  -- 5. Calculate Estimated Daily Profit
  -- Formula: Gross sales - seller commissions - allocated production ingredient costs - other operating expenses
  v_estimated_profit := v_gross_sales - v_tot_commission - v_tot_ingredient_cost - v_tot_expenses;

  -- 6. Calculate Closing Stock Value in Freezer
  SELECT COALESCE(SUM(
    fs.available_quantity * COALESCE(
      (SELECT selling_price FROM product_prices WHERE product_id = fs.product_id ORDER BY effective_from DESC LIMIT 1), 0
    )
  ), 0.00) INTO v_closing_stock_val
  FROM v_freezer_stock fs;

  -- 7. Upsert Daily Closing Record
  SELECT * INTO v_existing FROM daily_closings WHERE business_date = p_business_date;

  IF FOUND THEN
    IF v_existing.status = 'closed' THEN
      RAISE EXCEPTION 'Business day % is already closed', p_business_date;
    END IF;

    UPDATE daily_closings
    SET status = 'closed',
        total_produced = v_tot_produced,
        total_sold = v_tot_sold,
        total_returned = v_tot_returned,
        total_damaged = v_tot_damaged,
        total_complimentary = v_tot_comp,
        gross_sales = v_gross_sales,
        total_commission = v_tot_commission,
        net_sales = v_net_sales,
        cash_received = v_cash_received,
        upi_received = v_upi_received,
        credit_sales = v_credit_sales,
        total_expenses = v_tot_expenses,
        estimated_profit = v_estimated_profit,
        closing_stock_value = v_closing_stock_val,
        notes = p_notes,
        closed_by = p_user_id,
        closed_at = NOW(),
        reopened_by = NULL,
        reopened_at = NULL,
        reopen_reason = NULL
    WHERE business_date = p_business_date
    RETURNING id INTO v_closing_id;
  ELSE
    INSERT INTO daily_closings (
      business_date,
      status,
      total_produced,
      total_sold,
      total_returned,
      total_damaged,
      total_complimentary,
      gross_sales,
      total_commission,
      net_sales,
      cash_received,
      upi_received,
      credit_sales,
      total_expenses,
      estimated_profit,
      closing_stock_value,
      notes,
      closed_by,
      closed_at
    ) VALUES (
      p_business_date,
      'closed',
      v_tot_produced,
      v_tot_sold,
      v_tot_returned,
      v_tot_damaged,
      v_tot_comp,
      v_gross_sales,
      v_tot_commission,
      v_net_sales,
      v_cash_received,
      v_upi_received,
      v_credit_sales,
      v_tot_expenses,
      v_estimated_profit,
      v_closing_stock_val,
      p_notes,
      p_user_id,
      NOW()
    ) RETURNING id INTO v_closing_id;
  END IF;

  -- Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'daily_closings',
    v_closing_id,
    'CLOSE_BUSINESS_DAY',
    jsonb_build_object('business_date', p_business_date, 'estimated_profit', v_estimated_profit),
    'Daily closing finalized',
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'closing_id', v_closing_id,
    'business_date', p_business_date,
    'gross_sales', v_gross_sales,
    'net_sales', v_net_sales,
    'total_expenses', v_tot_expenses,
    'estimated_profit', v_estimated_profit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Reopen Business Day (Owner Only, Mandatory Reason)
CREATE OR REPLACE FUNCTION reopen_business_day(
  p_business_date DATE,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_closing RECORD;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A clear, mandatory reason of at least 5 characters is required to reopen a closed business day.';
  END IF;

  SELECT * INTO v_closing FROM daily_closings WHERE business_date = p_business_date FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No closing record found for business date %', p_business_date;
  END IF;

  IF v_closing.status = 'reopened' THEN
    RAISE EXCEPTION 'Business day % is already reopened', p_business_date;
  END IF;

  UPDATE daily_closings
  SET status = 'reopened',
      reopened_by = p_user_id,
      reopened_at = NOW(),
      reopen_reason = p_reason
  WHERE business_date = p_business_date;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'daily_closings',
    v_closing.id,
    'REOPEN_BUSINESS_DAY',
    row_to_json(v_closing)::jsonb,
    jsonb_build_object('status', 'reopened', 'reopen_reason', p_reason),
    p_reason,
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'business_date', p_business_date, 'status', 'reopened');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Void Expense (Mandatory Reason, No hard delete)
CREATE OR REPLACE FUNCTION void_expense(
  p_expense_id UUID,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_expense RECORD;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A valid reason is required to void an expense.';
  END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_expense.status = 'voided' THEN
    RAISE EXCEPTION 'Expense is already voided';
  END IF;

  UPDATE expenses
  SET status = 'voided',
      void_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'expenses',
    p_expense_id,
    'VOID_EXPENSE',
    row_to_json(v_expense)::jsonb,
    jsonb_build_object('status', 'voided', 'void_reason', p_reason),
    p_reason,
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id, 'status', 'voided');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Adjust Stock (Manual Correction with Audit)
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id UUID,
  p_location_id UUID,
  p_quantity INTEGER,
  p_movement_type stock_movement_type,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_movement_id UUID;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required for manual stock adjustment';
  END IF;

  INSERT INTO stock_movements (
    product_id,
    destination_location_id,
    quantity,
    movement_type,
    notes,
    created_by
  ) VALUES (
    p_product_id,
    p_location_id,
    p_quantity,
    p_movement_type,
    p_reason,
    p_user_id
  ) RETURNING id INTO v_movement_id;

  INSERT INTO audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'stock_movements',
    v_movement_id,
    'ADJUST_STOCK',
    jsonb_build_object('product_id', p_product_id, 'location_id', p_location_id, 'quantity', p_quantity),
    p_reason,
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'movement_id', v_movement_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
