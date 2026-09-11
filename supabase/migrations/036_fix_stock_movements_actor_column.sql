-- ============================================================================
-- Migration 036: Fix stock_movements Actor Column (created_by) in Stored Procedures
-- ============================================================================
-- Purpose:
--   Fix error: column "performed_by" of relation "stock_movements" does not exist.
--   The canonical actor column in public.stock_movements is created_by (UUID).
--   This migration updates all 6 live public functions that interact with stock_movements:
--     1. issue_seller_stock
--     2. process_seller_settlement
--     3. approve_pending_settlement
--     4. complete_production_batch
--     5. adjust_stock
--     6. complete_production_with_recipe_transaction
--
-- Security & Compatibility:
--   - Exact existing parameter types and return types are preserved.
--   - For functions accepting p_user_id UUID, enforces auth.uid() check and uses auth.uid() for created_by.
--   - For complete_production_with_recipe_transaction, p_user_id TEXT is safely resolved and prefers auth.uid().
--   - Safe search_path = public, extensions, pg_temp is configured on all functions.
-- ============================================================================

-- 1. Drop existing overloaded function signatures to ensure clean recreation
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname IN (
      'issue_seller_stock',
      'process_seller_settlement',
      'approve_pending_settlement',
      'complete_production_batch',
      'adjust_stock',
      'complete_production_with_recipe_transaction'
    )
    AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE;';
  END LOOP;
END $$;

-- ============================================================================
-- 1. issue_seller_stock
-- ============================================================================
CREATE OR REPLACE FUNCTION public.issue_seller_stock(
  p_seller_id UUID,
  p_cart_id UUID,
  p_issue_date DATE,
  p_items JSONB, -- Array of { product_id, issued_quantity }
  p_notes TEXT,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
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
  -- Strict authentication & identity validation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'User identity mismatch';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot create an empty stock issue. At least one product is required.';
  END IF;

  v_freezer_loc_id := public.get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := public.get_or_create_stock_location('seller', p_seller_id);

  -- Generate readable issue number: IS-YYYYMMDD-001
  v_today_code := 'IS-' || TO_CHAR(COALESCE(p_issue_date, CURRENT_DATE), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_seq FROM public.seller_issues WHERE issue_number LIKE v_today_code || '%';
  v_issue_number := v_today_code || '-' || LPAD(v_seq::TEXT, 3, '0');

  -- Create Issue Header
  INSERT INTO public.seller_issues (
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
    auth.uid()
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
    FROM public.v_freezer_stock 
    WHERE product_id = v_product_id;

    IF v_available_qty IS NULL OR v_available_qty < v_quantity THEN
      RAISE EXCEPTION 'Insufficient freezer stock for product % (Available: %, Requested: %)', 
        v_product_id, COALESCE(v_available_qty, 0), v_quantity;
    END IF;

    -- Get Active Price and Commission Snapshot
    SELECT selling_price, commission_type, commission_value INTO v_price
    FROM public.product_prices
    WHERE product_id = v_product_id
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active price configuration found for product %', v_product_id;
    END IF;

    -- Insert Issue Item with Snapshots
    INSERT INTO public.seller_issue_items (
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
    INSERT INTO public.stock_movements (
      movement_date,
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
      COALESCE(p_issue_date::timestamptz, NOW()),
      v_product_id,
      v_freezer_loc_id,
      v_seller_loc_id,
      v_quantity,
      'seller_issued',
      'seller_issues',
      v_issue_id,
      'Stock issue: ' || v_issue_number,
      auth.uid()
    );
  END LOOP;

  -- Audit Log
  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'seller_issues',
    v_issue_id,
    'ISSUE_SELLER_STOCK',
    jsonb_build_object('issue_number', v_issue_number, 'seller_id', p_seller_id, 'items', p_items),
    'Stock issued to seller',
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'issue_id', v_issue_id, 'issue_number', v_issue_number);
END;
$$;

-- ============================================================================
-- 2. process_seller_settlement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_seller_settlement(
  p_seller_issue_id UUID,
  p_settlement_date DATE,
  p_items JSONB, -- Array of { issue_item_id, returned_qty, damaged_qty, comp_qty, damage_reason, comp_reason }
  p_cash NUMERIC(12,2),
  p_upi NUMERIC(12,2),
  p_credit NUMERIC(12,2),
  p_notes TEXT,
  p_is_approved_by_owner BOOLEAN,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
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
  -- Strict authentication & identity validation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'User identity mismatch';
  END IF;

  -- Validate Issue
  SELECT * INTO v_issue FROM public.seller_issues WHERE id = p_seller_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock issue not found';
  END IF;

  IF v_issue.status = 'settled' THEN
    RAISE EXCEPTION 'This issue is already fully settled';
  END IF;

  v_freezer_loc_id := public.get_or_create_stock_location('main_freezer');
  v_seller_loc_id := public.get_or_create_stock_location('seller', v_issue.seller_id);
  v_damaged_loc_id := public.get_or_create_stock_location('damaged');
  v_comp_loc_id := public.get_or_create_stock_location('complimentary');

  -- Generate Settlement Number: ST-YYYYMMDD-001
  v_today_code := 'ST-' || TO_CHAR(COALESCE(p_settlement_date, CURRENT_DATE), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_seq FROM public.seller_settlements WHERE settlement_number LIKE v_today_code || '%';
  v_settlement_number := v_today_code || '-' || LPAD(v_seq::TEXT, 3, '0');

  v_status := CASE WHEN p_is_approved_by_owner THEN 'approved'::settlement_status ELSE 'pending_approval'::settlement_status END;

  -- Create Settlement Draft Header
  INSERT INTO public.seller_settlements (
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
    auth.uid(),
    CASE WHEN p_is_approved_by_owner THEN auth.uid() ELSE NULL END,
    NOW(),
    CASE WHEN p_is_approved_by_owner THEN NOW() ELSE NULL END
  ) RETURNING id INTO v_settlement_id;

  -- Process Items and Calculate Server-Side Totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_issue_item 
    FROM public.seller_issue_items 
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
    INSERT INTO public.settlement_items (
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
        INSERT INTO public.stock_movements (
          movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          COALESCE(p_settlement_date::timestamptz, NOW()), v_issue_item.product_id, v_seller_loc_id, v_freezer_loc_id, v_returned, 'seller_returned', 'seller_settlements', v_settlement_id, 'Returned to freezer: ' || v_settlement_number, auth.uid()
        );
      END IF;

      -- Damaged stock moves to damaged stock location
      IF v_damaged > 0 THEN
        INSERT INTO public.stock_movements (
          movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          COALESCE(p_settlement_date::timestamptz, NOW()), v_issue_item.product_id, v_seller_loc_id, v_damaged_loc_id, v_damaged, 'damaged', 'seller_settlements', v_settlement_id, 'Seller damaged: ' || COALESCE(v_item->>'damage_reason', ''), auth.uid()
        );
      END IF;

      -- Complimentary pieces move to complimentary location
      IF v_comp > 0 THEN
        INSERT INTO public.stock_movements (
          movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          COALESCE(p_settlement_date::timestamptz, NOW()), v_issue_item.product_id, v_seller_loc_id, v_comp_loc_id, v_comp, 'complimentary', 'seller_settlements', v_settlement_id, 'Complimentary: ' || COALESCE(v_item->>'comp_reason', ''), auth.uid()
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
  UPDATE public.seller_settlements
  SET gross_sales = v_tot_gross,
      total_commission = v_tot_commission,
      expected_collection = v_expected_collection,
      total_received = v_total_received,
      outstanding_amount = v_outstanding,
      shortage_amount = v_shortage,
      updated_at = NOW()
  WHERE id = v_settlement_id;

  IF p_is_approved_by_owner THEN
    UPDATE public.seller_issues SET status = 'settled', updated_at = NOW() WHERE id = p_seller_issue_id;
  ELSE
    UPDATE public.seller_issues SET status = 'partially_settled', updated_at = NOW() WHERE id = p_seller_issue_id;
  END IF;

  -- Audit Log
  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'seller_settlements',
    v_settlement_id,
    CASE WHEN p_is_approved_by_owner THEN 'APPROVE_SETTLEMENT' ELSE 'SUBMIT_SETTLEMENT' END,
    jsonb_build_object('settlement_number', v_settlement_number, 'gross_sales', v_tot_gross, 'status', v_status),
    'Seller settlement processed',
    auth.uid()
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
$$;

-- ============================================================================
-- 3. approve_pending_settlement
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_pending_settlement(
  p_settlement_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_settlement RECORD;
  v_item RECORD;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_damaged_loc_id UUID;
  v_comp_loc_id UUID;
BEGIN
  -- Strict authentication & identity validation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'User identity mismatch';
  END IF;

  SELECT * INTO v_settlement FROM public.seller_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found';
  END IF;

  IF v_settlement.status = 'approved' THEN
    RAISE EXCEPTION 'Settlement is already approved';
  END IF;

  v_freezer_loc_id := public.get_or_create_stock_location('main_freezer');
  v_seller_loc_id := public.get_or_create_stock_location('seller', v_settlement.seller_id);
  v_damaged_loc_id := public.get_or_create_stock_location('damaged');
  v_comp_loc_id := public.get_or_create_stock_location('complimentary');

  -- Move stock for each settlement item
  FOR v_item IN SELECT * FROM public.settlement_items WHERE settlement_id = p_settlement_id LOOP
    IF v_item.returned_quantity > 0 THEN
      INSERT INTO public.stock_movements (
        movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        COALESCE(v_settlement.settlement_date::timestamptz, NOW()), v_item.product_id, v_seller_loc_id, v_freezer_loc_id, v_item.returned_quantity, 'seller_returned', 'seller_settlements', p_settlement_id, 'Returned stock: ' || v_settlement.settlement_number, auth.uid()
      );
    END IF;

    IF v_item.damaged_quantity > 0 THEN
      INSERT INTO public.stock_movements (
        movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        COALESCE(v_settlement.settlement_date::timestamptz, NOW()), v_item.product_id, v_seller_loc_id, v_damaged_loc_id, v_item.damaged_quantity, 'damaged', 'seller_settlements', p_settlement_id, 'Damaged stock approved: ' || COALESCE(v_item.damage_reason, ''), auth.uid()
      );
    END IF;

    IF v_item.complimentary_quantity > 0 THEN
      INSERT INTO public.stock_movements (
        movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        COALESCE(v_settlement.settlement_date::timestamptz, NOW()), v_item.product_id, v_seller_loc_id, v_comp_loc_id, v_item.complimentary_quantity, 'complimentary', 'seller_settlements', p_settlement_id, 'Complimentary approved: ' || COALESCE(v_item.complimentary_reason, ''), auth.uid()
      );
    END IF;
  END LOOP;

  -- Update Settlement Status
  UPDATE public.seller_settlements
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_settlement_id;

  -- Update Issue Status
  UPDATE public.seller_issues
  SET status = 'settled',
      updated_at = NOW()
  WHERE id = v_settlement.seller_issue_id;

  -- Audit Log
  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'seller_settlements',
    p_settlement_id,
    'APPROVE_SETTLEMENT',
    row_to_json(v_settlement)::jsonb,
    jsonb_build_object('status', 'approved', 'approved_by', auth.uid()),
    'Owner approved settlement',
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'settlement_id', p_settlement_id, 'status', 'approved');
END;
$$;

-- ============================================================================
-- 4. complete_production_batch
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_production_batch(
  p_batch_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_total_saleable INTEGER := 0;
  v_total_cost NUMERIC(12,2) := 0;
BEGIN
  -- Strict authentication & identity validation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'User identity mismatch';
  END IF;

  -- Validate Batch
  SELECT * INTO v_batch FROM public.production_batches WHERE id = p_batch_id FOR UPDATE;
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
  v_prod_loc_id := public.get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := public.get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');

  -- Process Items
  FOR v_item IN SELECT * FROM public.production_items WHERE batch_id = p_batch_id FOR UPDATE LOOP
    IF v_item.produced_quantity < 0 OR v_item.damaged_quantity < 0 THEN
      RAISE EXCEPTION 'Quantities cannot be negative';
    END IF;
    IF v_item.damaged_quantity > v_item.produced_quantity THEN
      RAISE EXCEPTION 'Damaged quantity cannot exceed produced quantity';
    END IF;

    -- Update calculated saleable quantity
    UPDATE public.production_items
    SET saleable_quantity = v_item.produced_quantity - v_item.damaged_quantity,
        unit_production_cost = CASE WHEN (v_item.produced_quantity - v_item.damaged_quantity) > 0 
          THEN ROUND(v_item.allocated_ingredient_cost / (v_item.produced_quantity - v_item.damaged_quantity), 2)
          ELSE 0.00 END
    WHERE id = v_item.id;

    -- Create stock movement for saleable stock into Main Freezer
    IF (v_item.produced_quantity - v_item.damaged_quantity) > 0 THEN
      INSERT INTO public.stock_movements (
        movement_date,
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
        COALESCE(v_batch.production_date::timestamptz, NOW()),
        v_item.product_id,
        v_prod_loc_id,
        v_freezer_loc_id,
        v_item.produced_quantity - v_item.damaged_quantity,
        'production_completed',
        'production_batches',
        p_batch_id,
        'Batch completed: ' || v_batch.batch_number,
        auth.uid()
      );
    END IF;

    -- If damaged during production, record to damaged stock location
    IF v_item.damaged_quantity > 0 THEN
      INSERT INTO public.stock_movements (
        movement_date,
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
        COALESCE(v_batch.production_date::timestamptz, NOW()),
        v_item.product_id,
        v_prod_loc_id,
        public.get_or_create_stock_location('damaged', NULL, 'Damaged Stock'),
        v_item.damaged_quantity,
        'damaged',
        'production_batches',
        p_batch_id,
        'Production wastage in batch: ' || v_batch.batch_number,
        auth.uid()
      );
    END IF;

    v_total_saleable := v_total_saleable + (v_item.produced_quantity - v_item.damaged_quantity);
  END LOOP;

  -- Update Batch Status
  UPDATE public.production_batches
  SET status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_batch_id;

  -- Log Audit
  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'production_batches',
    p_batch_id,
    'COMPLETE_PRODUCTION',
    row_to_json(v_batch)::jsonb,
    jsonb_build_object('status', 'completed', 'total_saleable', v_total_saleable),
    'Production batch completed and moved to freezer',
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'total_saleable', v_total_saleable);
END;
$$;

-- ============================================================================
-- 5. adjust_stock
-- ============================================================================
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id UUID,
  p_location_id UUID,
  p_quantity INTEGER,
  p_movement_type stock_movement_type,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_movement_id UUID;
BEGIN
  -- Strict authentication & identity validation
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'User identity mismatch';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required for manual stock adjustment';
  END IF;

  INSERT INTO public.stock_movements (
    movement_date,
    product_id,
    destination_location_id,
    quantity,
    movement_type,
    notes,
    created_by
  ) VALUES (
    NOW(),
    p_product_id,
    p_location_id,
    p_quantity,
    p_movement_type,
    p_reason,
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'stock_movements',
    v_movement_id,
    'ADJUST_STOCK',
    jsonb_build_object('product_id', p_product_id, 'location_id', p_location_id, 'quantity', p_quantity),
    p_reason,
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'movement_id', v_movement_id);
END;
$$;

-- ============================================================================
-- 6. complete_production_with_recipe_transaction
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_production_with_recipe_transaction(
  p_production_date DATE,
  p_product_id UUID,
  p_produced_quantity INTEGER,
  p_damaged_quantity INTEGER DEFAULT 0,
  p_recipe_id UUID DEFAULT NULL,
  p_actual_ingredients JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT '',
  p_lpg_cost NUMERIC DEFAULT 0.00,
  p_overhead_costs JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := NULL;
  v_user_role TEXT;
  v_batch_id UUID;
  v_batch_number TEXT;
  v_product RECORD;
  v_recipe RECORD;
  v_expected_yield NUMERIC;
  v_saleable_qty INTEGER;
  v_produced_qty INTEGER;
  v_damaged_qty INTEGER;
  v_scale_factor NUMERIC;
  v_rec_item RECORD;
  v_std_item_qty NUMERIC(12,3);
  v_actual_item_qty NUMERIC(12,3);
  v_item_base_qty NUMERIC(12,3);
  v_avail_stock NUMERIC(12,3);
  v_shortage NUMERIC(12,3);
  v_item_rate NUMERIC(12,4);
  v_item_cost NUMERIC(12,2);
  v_item_rate_qty NUMERIC(12,3);
  v_total_ingredient_cost NUMERIC(12,2) := 0.00;
  v_total_batch_cost NUMERIC(12,2) := 0.00;
  v_cost_per_piece NUMERIC(12,2) := 0.00;
  v_costing_source TEXT := 'recipe_calculated';
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_shortages JSONB := '[]'::jsonb;
  v_actual_override_entry JSONB;
  v_has_actual_override BOOLEAN := false;
  v_variance_reason TEXT := NULL;
  v_calculated_ingredients JSONB := '[]'::jsonb;
  v_existing_batch RECORD;
  v_calc_item JSONB;
BEGIN
  -- 1. Caller Identification (Safely handle UUID or fallback text)
  IF auth.uid() IS NOT NULL THEN
    v_caller_id := auth.uid();
  ELSIF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_caller_id := p_user_id::UUID;
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_user_role FROM public.profiles WHERE id = v_caller_id;
  END IF;

  -- 2. Idempotency Check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_batch 
    FROM public.production_batches 
    WHERE idempotency_key = p_idempotency_key 
    LIMIT 1;

    IF v_existing_batch.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'batch_id', v_existing_batch.id,
        'batch_number', v_existing_batch.batch_number,
        'saleable_quantity', COALESCE(v_existing_batch.total_saleable_quantity, 0),
        'total_ingredient_cost', COALESCE(v_existing_batch.total_ingredient_cost, 0),
        'cost_per_piece', COALESCE(v_existing_batch.cost_per_saleable_piece, 0),
        'message', 'Production batch already completed (Idempotent replay)'
      );
    END IF;
  END IF;

  -- 3. Quantity Validations
  v_produced_qty := COALESCE(p_produced_quantity, 0);
  v_damaged_qty := COALESCE(p_damaged_quantity, 0);

  IF v_produced_qty <= 0 THEN
    RAISE EXCEPTION 'उत्पादन मात्रा शून्य से अधिक होनी चाहिए (Produced quantity must be greater than 0)';
  END IF;

  IF v_damaged_qty < 0 THEN
    v_damaged_qty := 0;
  END IF;

  IF v_damaged_qty > v_produced_qty THEN
    RAISE EXCEPTION 'खराब मात्रा (% pcs) कुल उत्पादन मात्रा (% pcs) से अधिक नहीं हो सकती',
      v_damaged_qty, v_produced_qty;
  END IF;

  v_saleable_qty := GREATEST(0, v_produced_qty - v_damaged_qty);

  -- 4. Lock & Validate Product
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % does not exist in catalog', p_product_id;
  END IF;

  -- 5. Lock & Load Active Recipe
  IF p_recipe_id IS NOT NULL THEN
    SELECT * INTO v_recipe FROM public.recipes WHERE id = p_recipe_id FOR UPDATE;
  ELSE
    SELECT * INTO v_recipe FROM public.recipes 
    WHERE product_id = p_product_id AND (status = 'active' OR is_default = true)
    ORDER BY version_number DESC LIMIT 1 FOR UPDATE;
  END IF;

  IF v_recipe.id IS NULL THEN
    RAISE EXCEPTION 'उत्पाद "%" (%) के लिए कोई सक्रिय रेसिपी (Active Recipe) उपलब्ध नहीं है',
      v_product.name_hi, v_product.name_en;
  END IF;

  v_expected_yield := COALESCE(v_recipe.expected_yield_pieces, v_recipe.standard_output_pieces, 100);
  IF v_expected_yield <= 0 THEN
    v_expected_yield := 100;
  END IF;

  -- Verify recipe has items
  IF NOT EXISTS (SELECT 1 FROM public.recipe_items WHERE recipe_id = v_recipe.id) THEN
    RAISE EXCEPTION 'रेसिपी "%" में कोई सामग्री (Ingredients) कॉन्फ़िगर नहीं है', v_recipe.name;
  END IF;

  v_scale_factor := v_produced_qty::NUMERIC / v_expected_yield::NUMERIC;

  -- 6. Process Recipe Items, Normalize Units, and Pre-validate Stock
  FOR v_rec_item IN 
    SELECT 
      ri.id,
      ri.recipe_id,
      ri.ingredient_id,
      COALESCE(ri.quantity, 0) AS quantity,
      ri.unit,
      ri.sort_order,
      i.name_en, 
      i.name_hi, 
      i.base_unit, 
      COALESCE(i.conversion_factor, 1.0000) AS conversion_factor, 
      COALESCE(i.current_rate, 0.00) AS current_rate, 
      COALESCE(i.rate_unit, i.base_unit) AS rate_unit, 
      i.category, 
      COALESCE(i.storage_location, 'Main Store') AS storage_location,
      COALESCE(i.track_inventory, true) AS track_inventory
    FROM public.recipe_items ri
    JOIN public.ingredients i ON ri.ingredient_id = i.id
    WHERE ri.recipe_id = v_recipe.id
    ORDER BY ri.sort_order, ri.id
  LOOP
    -- Lock ingredient row
    PERFORM 1 FROM public.ingredients WHERE id = v_rec_item.ingredient_id FOR UPDATE;

    -- Validate item quantity > 0
    IF v_rec_item.quantity <= 0 THEN
      RAISE EXCEPTION 'रेसिपी आइटम "%" (%) के लिए मात्रा शून्य या नकारात्मक नहीं हो सकती',
        v_rec_item.name_hi, v_rec_item.name_en;
    END IF;

    v_std_item_qty := ROUND((v_rec_item.quantity * v_scale_factor), 3);
    v_actual_item_qty := v_std_item_qty;
    v_variance_reason := NULL;

    -- Check if manual override provided for this ingredient
    IF p_actual_ingredients IS NOT NULL AND jsonb_array_length(p_actual_ingredients) > 0 THEN
      FOR v_actual_override_entry IN SELECT * FROM jsonb_array_elements(p_actual_ingredients) LOOP
        IF (v_actual_override_entry->>'ingredient_id')::TEXT = v_rec_item.ingredient_id::TEXT THEN
          v_actual_item_qty := (v_actual_override_entry->>'actual_quantity')::NUMERIC;
          v_variance_reason := v_actual_override_entry->>'reason';
          v_has_actual_override := true;
        END IF;
      END LOOP;
    END IF;

    -- Unit conversion to base unit (kg, litre, piece)
    IF v_rec_item.unit = v_rec_item.base_unit THEN
      v_item_base_qty := v_actual_item_qty;
    ELSIF v_rec_item.unit = 'g' AND v_rec_item.base_unit = 'kg' THEN
      v_item_base_qty := v_actual_item_qty / 1000.0;
    ELSIF v_rec_item.unit = 'kg' AND v_rec_item.base_unit = 'g' THEN
      v_item_base_qty := v_actual_item_qty * 1000.0;
    ELSIF v_rec_item.unit = 'ml' AND v_rec_item.base_unit = 'litre' THEN
      v_item_base_qty := v_actual_item_qty / 1000.0;
    ELSIF v_rec_item.unit = 'litre' AND v_rec_item.base_unit = 'ml' THEN
      v_item_base_qty := v_actual_item_qty * 1000.0;
    ELSIF v_rec_item.conversion_factor > 0 AND v_rec_item.unit <> v_rec_item.base_unit THEN
      v_item_base_qty := v_actual_item_qty * v_rec_item.conversion_factor;
    ELSE
      v_item_base_qty := v_actual_item_qty;
    END IF;

    -- Check Authoritative Live Stock Availability if inventory is tracked
    IF v_rec_item.track_inventory THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_avail_stock
      FROM public.raw_material_movements
      WHERE ingredient_id = v_rec_item.ingredient_id;

      IF v_avail_stock < v_item_base_qty THEN
        v_shortage := ROUND(v_item_base_qty - v_avail_stock, 3);
        v_shortages := v_shortages || jsonb_build_array(jsonb_build_object(
          'ingredient_id', v_rec_item.ingredient_id,
          'ingredient_name_hi', v_rec_item.name_hi,
          'ingredient_name_en', v_rec_item.name_en,
          'required', v_item_base_qty,
          'available', v_avail_stock,
          'shortage', v_shortage,
          'unit', v_rec_item.base_unit
        ));
      END IF;
    END IF;

    -- Unit conversion to rate unit for costing
    IF v_rec_item.unit = COALESCE(v_rec_item.rate_unit, v_rec_item.base_unit) THEN
      v_item_rate_qty := v_actual_item_qty;
    ELSIF v_rec_item.unit = 'g' AND COALESCE(v_rec_item.rate_unit, v_rec_item.base_unit) = 'kg' THEN
      v_item_rate_qty := v_actual_item_qty / 1000.0;
    ELSIF v_rec_item.unit = 'kg' AND COALESCE(v_rec_item.rate_unit, v_rec_item.base_unit) = 'g' THEN
      v_item_rate_qty := v_actual_item_qty * 1000.0;
    ELSIF v_rec_item.unit = 'ml' AND COALESCE(v_rec_item.rate_unit, v_rec_item.base_unit) = 'litre' THEN
      v_item_rate_qty := v_actual_item_qty / 1000.0;
    ELSIF v_rec_item.unit = 'litre' AND COALESCE(v_rec_item.rate_unit, v_rec_item.base_unit) = 'ml' THEN
      v_item_rate_qty := v_actual_item_qty * 1000.0;
    ELSE
      v_item_rate_qty := v_actual_item_qty;
    END IF;

    v_item_rate := COALESCE(v_rec_item.current_rate, 0.00);
    v_item_cost := ROUND(v_item_rate_qty * v_item_rate, 2);
    v_total_ingredient_cost := v_total_ingredient_cost + v_item_cost;

    v_calculated_ingredients := v_calculated_ingredients || jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_rec_item.ingredient_id,
      'ingredient_name', v_rec_item.name_hi || ' (' || v_rec_item.name_en || ')',
      'ingredient_name_hi', v_rec_item.name_hi,
      'ingredient_name_en', v_rec_item.name_en,
      'expected_qty', v_std_item_qty,
      'actual_qty', v_actual_item_qty,
      'unit', v_rec_item.unit,
      'base_qty', v_item_base_qty,
      'base_unit', v_rec_item.base_unit,
      'rate_snapshot', v_item_rate,
      'rate_unit', v_rec_item.rate_unit,
      'calculated_cost', v_item_cost,
      'is_packaging', (v_rec_item.category = 'packaging'),
      'variance_reason', v_variance_reason,
      'storage_location', COALESCE(v_rec_item.storage_location, 'Main Store')
    ));
  END LOOP;

  -- 7. If insufficient stock, stop entire transaction with exact ingredient details
  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'अपर्याप्त कच्चा माल स्टॉक (Insufficient Stock): % सामग्री के लिए पर्याप्त स्टॉक उपलब्ध नहीं है। %',
      jsonb_array_length(v_shortages),
      v_shortages
      USING ERRCODE = '22023';
  END IF;

  IF v_has_actual_override THEN
    v_costing_source := 'actual_override';
  END IF;

  -- 8. Final Cost Breakdown
  v_total_batch_cost := v_total_ingredient_cost + COALESCE(p_lpg_cost, 0.00);
  IF v_produced_qty > 0 THEN
    v_cost_per_piece := ROUND(v_total_batch_cost / v_produced_qty, 2);
  END IF;

  -- 9. Create Production Batch Header
  v_batch_number := 'BAT-' || TO_CHAR(COALESCE(p_production_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

  INSERT INTO public.production_batches (
    batch_number,
    production_date,
    status,
    total_ingredient_cost,
    recipe_id,
    overhead_costs,
    total_batch_cost,
    cost_per_saleable_piece,
    costing_source,
    idempotency_key,
    expected_yield_snapshot,
    recipe_version_snapshot,
    lpg_cost,
    notes,
    completed_at,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_batch_number,
    COALESCE(p_production_date, CURRENT_DATE),
    'completed',
    v_total_ingredient_cost,
    v_recipe.id,
    COALESCE(p_overhead_costs, '{}'::jsonb),
    v_total_batch_cost,
    v_cost_per_piece,
    v_costing_source,
    p_idempotency_key,
    v_expected_yield::INTEGER,
    COALESCE(v_recipe.version_number, 1),
    COALESCE(p_lpg_cost, 0.00),
    p_notes,
    NOW(),
    v_caller_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_batch_id;

  -- 10. Insert Production Item (Guaranteed not null)
  INSERT INTO public.production_items (
    batch_id,
    product_id,
    produced_quantity,
    damaged_quantity,
    saleable_quantity,
    allocated_ingredient_cost,
    unit_production_cost,
    notes
  ) VALUES (
    v_batch_id,
    p_product_id,
    v_produced_qty,
    v_damaged_qty,
    v_saleable_qty,
    v_total_ingredient_cost,
    v_cost_per_piece,
    p_notes
  );

  -- 11. Insert Batch Ingredient Snapshots & Deduct Raw Material Stock
  FOR v_calc_item IN SELECT * FROM jsonb_array_elements(v_calculated_ingredients) LOOP
    INSERT INTO public.production_batch_ingredients (
      batch_id,
      ingredient_id,
      ingredient_name,
      ingredient_name_snapshot,
      quantity_used,
      expected_quantity,
      actual_quantity,
      unit,
      converted_base_quantity,
      rate_snapshot,
      rate_unit,
      calculated_cost,
      is_packaging,
      variance_reason
    ) VALUES (
      v_batch_id,
      (v_calc_item->>'ingredient_id')::UUID,
      v_calc_item->>'ingredient_name',
      v_calc_item->>'ingredient_name',
      (v_calc_item->>'actual_qty')::NUMERIC,
      (v_calc_item->>'expected_qty')::NUMERIC,
      (v_calc_item->>'actual_qty')::NUMERIC,
      v_calc_item->>'unit',
      (v_calc_item->>'base_qty')::NUMERIC,
      (v_calc_item->>'rate_snapshot')::NUMERIC,
      v_calc_item->>'rate_unit',
      (v_calc_item->>'calculated_cost')::NUMERIC,
      (v_calc_item->>'is_packaging')::BOOLEAN,
      v_calc_item->>'variance_reason'
    );

    -- Stock Movement (Raw Material Consumption - Atomic Ledger Deduction)
    INSERT INTO public.raw_material_movements (
      ingredient_id,
      movement_type,
      quantity,
      base_unit,
      unit_cost_snapshot,
      total_value_snapshot,
      reference_table,
      reference_id,
      movement_date,
      source_location,
      destination_location,
      reason,
      performed_by,
      created_by
    ) VALUES (
      (v_calc_item->>'ingredient_id')::UUID,
      'production_consumption',
      -ABS((v_calc_item->>'base_qty')::NUMERIC),
      COALESCE(v_calc_item->>'base_unit', (SELECT base_unit FROM public.ingredients WHERE id = (v_calc_item->>'ingredient_id')::UUID), 'kg'),
      (v_calc_item->>'rate_snapshot')::NUMERIC,
      -ABS((v_calc_item->>'calculated_cost')::NUMERIC),
      'production_batches',
      v_batch_id,
      COALESCE(p_production_date, CURRENT_DATE),
      COALESCE(v_calc_item->>'storage_location', 'Main Store'),
      'Production Floor',
      'Batch consumption for ' || v_batch_number,
      v_caller_id,
      v_caller_id
    );
  END LOOP;

  -- 12. Finished Goods Stock Movement (into Main Freezer using canonical location_type)
  SELECT id INTO v_prod_loc_id FROM public.stock_locations WHERE location_type = 'production' LIMIT 1;
  IF v_prod_loc_id IS NULL THEN
    INSERT INTO public.stock_locations (location_type, name, is_active)
    VALUES ('production', 'Production Floor', true)
    RETURNING id INTO v_prod_loc_id;
  END IF;

  SELECT id INTO v_freezer_loc_id FROM public.stock_locations WHERE location_type = 'main_freezer' OR name ILIKE '%freezer%' LIMIT 1;
  IF v_freezer_loc_id IS NULL THEN
    INSERT INTO public.stock_locations (location_type, name, is_active)
    VALUES ('main_freezer', 'Main Freezer', true)
    RETURNING id INTO v_freezer_loc_id;
  END IF;

  IF v_saleable_qty > 0 THEN
    INSERT INTO public.stock_movements (
      movement_date,
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
      COALESCE(p_production_date::timestamptz, NOW()),
      p_product_id,
      v_prod_loc_id,
      v_freezer_loc_id,
      v_saleable_qty,
      'production_completed',
      'production_batches',
      v_batch_id,
      'Batch completed: ' || v_batch_number,
      v_caller_id
    );
  END IF;

  -- 13. Audit Log
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    new_data,
    reason,
    performed_by
  ) VALUES (
    'production_batches',
    v_batch_id,
    'COMPLETE_PRODUCTION_BATCH',
    jsonb_build_object(
      'batch_number', v_batch_number,
      'product_id', p_product_id,
      'produced_quantity', v_produced_qty,
      'damaged_quantity', v_damaged_qty,
      'saleable_quantity', v_saleable_qty,
      'total_batch_cost', v_total_batch_cost,
      'cost_per_piece', v_cost_per_piece
    ),
    'Completed production batch with recipe ' || v_batch_number,
    v_caller_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'saleable_quantity', v_saleable_qty,
    'produced_quantity', v_produced_qty,
    'damaged_quantity', v_damaged_qty,
    'total_ingredient_cost', v_total_ingredient_cost,
    'total_batch_cost', v_total_batch_cost,
    'cost_per_piece', v_cost_per_piece,
    'costing_source', v_costing_source,
    'ingredients_used', v_calculated_ingredients,
    'message', 'Production batch ' || v_batch_number || ' completed successfully'
  );
END;
$$;

-- ============================================================================
-- Grants and Permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.issue_seller_stock(UUID, UUID, DATE, JSONB, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_seller_settlement(UUID, DATE, JSONB, NUMERIC, NUMERIC, NUMERIC, TEXT, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pending_settlement(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_production_batch(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, UUID, INTEGER, stock_movement_type, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_production_with_recipe_transaction(DATE, UUID, INTEGER, INTEGER, UUID, JSONB, TEXT, NUMERIC, JSONB, UUID, TEXT) TO authenticated, anon;

-- ============================================================================
-- Notify PostgREST schema cache reload
-- ============================================================================
NOTIFY pgrst, 'reload schema';
