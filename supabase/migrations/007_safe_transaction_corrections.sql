-- Janki Kulfi Management Schema Migration 007
-- Safe Transaction Corrections, Reversals, and Version History

-- 1. Extend Status and Movement Enums
DO $$
BEGIN
  ALTER TYPE batch_status ADD VALUE IF NOT EXISTS 'corrected';
  ALTER TYPE batch_status ADD VALUE IF NOT EXISTS 'superseded';

  ALTER TYPE issue_status ADD VALUE IF NOT EXISTS 'corrected';
  ALTER TYPE issue_status ADD VALUE IF NOT EXISTS 'superseded';

  ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'corrected';
  ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'superseded';

  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'production_reversal';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'issue_reversal';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'settlement_reversal';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'correction_replacement';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add Versioning and Correction Audit Columns to Tables

-- Production Batches Versioning
ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS correction_of_id UUID REFERENCES production_batches(id),
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES production_batches(id),
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

-- Seller Issues Versioning
ALTER TABLE seller_issues
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS correction_of_id UUID REFERENCES seller_issues(id),
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES seller_issues(id),
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

-- Seller Settlements Versioning
ALTER TABLE seller_settlements
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS correction_of_id UUID REFERENCES seller_settlements(id),
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES seller_settlements(id),
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

-- Stock Movements Reversal Tracking
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS reversal_of_movement_id UUID REFERENCES stock_movements(id);

-- Indexes for versioning and history queries
CREATE INDEX IF NOT EXISTS idx_prod_batches_current ON production_batches(is_current_version, production_date);
CREATE INDEX IF NOT EXISTS idx_prod_batches_correction ON production_batches(correction_of_id);
CREATE INDEX IF NOT EXISTS idx_seller_issues_current ON seller_issues(is_current_version, issue_date);
CREATE INDEX IF NOT EXISTS idx_seller_issues_correction ON seller_issues(correction_of_id);
CREATE INDEX IF NOT EXISTS idx_settlements_current ON seller_settlements(is_current_version, settlement_date);
CREATE INDEX IF NOT EXISTS idx_settlements_correction ON seller_settlements(correction_of_id);

-- 3. Stored Procedure: Correct Completed Production Batch
CREATE OR REPLACE FUNCTION correct_completed_production(
  p_batch_id UUID,
  p_date DATE,
  p_cost NUMERIC(12,2),
  p_notes TEXT,
  p_items JSONB,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_old_batch RECORD;
  v_new_batch_id UUID;
  v_new_batch_number TEXT;
  v_item RECORD;
  v_new_item JSONB;
  v_product_id UUID;
  v_produced_qty INTEGER;
  v_damaged_qty INTEGER;
  v_saleable_qty INTEGER;
  v_allocated_cost NUMERIC(12,2);
  v_unit_cost NUMERIC(12,2);
  v_total_saleable INTEGER := 0;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_old_movement RECORD;
  v_closing RECORD;
  v_current_freezer_balance INTEGER;
  v_original_saleable INTEGER;
  v_net_stock_diff INTEGER;
BEGIN
  -- 1. Check Owner Permission
  IF NOT (SELECT role = 'owner' FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Access Denied: Only Owners are authorized to correct completed production batches.';
  END IF;

  -- 2. Validate Reason
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A valid explanation of at least 5 characters is required for correcting a completed batch.';
  END IF;

  -- 3. Lock & Load Original Batch
  SELECT * INTO v_old_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found.';
  END IF;

  IF v_old_batch.status != 'completed' OR v_old_batch.is_current_version = false THEN
    RAISE EXCEPTION 'Only active, completed production batches can be corrected.';
  END IF;

  -- 4. Check Closed Day
  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_old_batch.production_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. You must reopen the business day first before correcting this record.', v_old_batch.production_date;
  END IF;

  -- 5. Calculate Total Saleable Pieces for Cost Allocation
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_produced_qty := COALESCE((v_new_item->>'produced_quantity')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_new_item->>'damaged_quantity')::INTEGER, 0);
    IF v_damaged_qty > v_produced_qty THEN
      RAISE EXCEPTION 'Damaged quantity (%) cannot exceed produced quantity (%)', v_damaged_qty, v_produced_qty;
    END IF;
    v_total_saleable := v_total_saleable + (v_produced_qty - v_damaged_qty);
  END LOOP;

  -- 6. Stock Safety Check: Ensure reduction doesn't drive freezer stock below zero
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');

  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_saleable_qty := COALESCE((v_new_item->>'produced_quantity')::INTEGER, 0) - COALESCE((v_new_item->>'damaged_quantity')::INTEGER, 0);

    -- Find original saleable quantity from old batch
    SELECT COALESCE(saleable_quantity, 0) INTO v_original_saleable
    FROM production_items
    WHERE batch_id = p_batch_id AND product_id = v_product_id;

    v_net_stock_diff := v_saleable_qty - COALESCE(v_original_saleable, 0);

    IF v_net_stock_diff < 0 THEN
      -- Check current freezer stock
      SELECT COALESCE(SUM(
        CASE WHEN destination_location_id = v_freezer_loc_id THEN quantity
             WHEN source_location_id = v_freezer_loc_id THEN -quantity
             ELSE 0 END
      ), 0) INTO v_current_freezer_balance
      FROM stock_movements
      WHERE product_id = v_product_id;

      IF v_current_freezer_balance + v_net_stock_diff < 0 THEN
        RAISE EXCEPTION 'Correction cannot reduce production below stock already issued or consumed. Current freezer stock is %, proposed reduction is %.', v_current_freezer_balance, ABS(v_net_stock_diff);
      END IF;
    END IF;
  END LOOP;

  -- 7. Reverse Original Stock Movements
  FOR v_old_movement IN
    SELECT * FROM stock_movements
    WHERE reference_table = 'production_batches'
      AND reference_id = p_batch_id
      AND movement_type IN ('production_completed', 'production_in')
  LOOP
    INSERT INTO stock_movements (
      movement_date,
      product_id,
      source_location_id,
      destination_location_id,
      quantity,
      movement_type,
      reference_table,
      reference_id,
      reversal_of_movement_id,
      notes,
      created_by
    ) VALUES (
      NOW(),
      v_old_movement.product_id,
      v_old_movement.destination_location_id,
      v_old_movement.source_location_id,
      v_old_movement.quantity,
      'production_reversal',
      'production_batches',
      p_batch_id,
      v_old_movement.id,
      'Reversal for correction: ' || p_reason,
      p_user_id
    );
  END LOOP;

  -- 8. Create Revised Batch Record (Version N+1)
  v_new_batch_number := v_old_batch.batch_number || '-V' || (v_old_batch.version_number + 1);

  INSERT INTO production_batches (
    batch_number,
    production_date,
    status,
    total_ingredient_cost,
    notes,
    completed_at,
    version_number,
    is_current_version,
    correction_of_id,
    correction_reason,
    corrected_by,
    corrected_at,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_new_batch_number,
    p_date,
    'completed',
    COALESCE(p_cost, 0.00),
    p_notes,
    NOW(),
    v_old_batch.version_number + 1,
    true,
    v_old_batch.id,
    p_reason,
    p_user_id,
    NOW(),
    v_old_batch.created_by,
    v_old_batch.created_at,
    NOW()
  ) RETURNING id INTO v_new_batch_id;

  -- 9. Insert Revised Production Items and Replacement Stock Movements
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_produced_qty := COALESCE((v_new_item->>'produced_quantity')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_new_item->>'damaged_quantity')::INTEGER, 0);
    v_saleable_qty := v_produced_qty - v_damaged_qty;

    IF v_total_saleable > 0 THEN
      v_allocated_cost := ROUND((COALESCE(p_cost, 0.00) * v_saleable_qty) / v_total_saleable, 2);
    ELSE
      v_allocated_cost := 0.00;
    END IF;

    IF v_saleable_qty > 0 THEN
      v_unit_cost := ROUND(v_allocated_cost / v_saleable_qty, 2);
    ELSE
      v_unit_cost := 0.00;
    END IF;

    INSERT INTO production_items (
      batch_id,
      product_id,
      produced_quantity,
      damaged_quantity,
      saleable_quantity,
      allocated_ingredient_cost,
      unit_production_cost,
      notes
    ) VALUES (
      v_new_batch_id,
      v_product_id,
      v_produced_qty,
      v_damaged_qty,
      v_saleable_qty,
      v_allocated_cost,
      v_unit_cost,
      v_new_item->>'notes'
    );

    IF v_saleable_qty > 0 THEN
      INSERT INTO stock_movements (
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
        NOW(),
        v_product_id,
        v_prod_loc_id,
        v_freezer_loc_id,
        v_saleable_qty,
        'production_completed',
        'production_batches',
        v_new_batch_id,
        'Replacement stock for correction V' || (v_old_batch.version_number + 1),
        p_user_id
      );
    END IF;
  END LOOP;

  -- 10. Mark Original Batch as Superseded
  UPDATE production_batches
  SET status = 'superseded',
      is_current_version = false,
      superseded_by_id = v_new_batch_id,
      updated_at = NOW()
  WHERE id = p_batch_id;

  -- 11. Write Audit Log
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    change_reason,
    user_id,
    created_at
  ) VALUES (
    'production_batches',
    v_new_batch_id,
    'CORRECT_RECORD',
    jsonb_build_object('id', v_old_batch.id, 'batch_number', v_old_batch.batch_number, 'cost', v_old_batch.total_ingredient_cost),
    jsonb_build_object('id', v_new_batch_id, 'batch_number', v_new_batch_number, 'cost', p_cost, 'version', v_old_batch.version_number + 1),
    p_reason,
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_batch_id', v_new_batch_id,
    'new_batch_number', v_new_batch_number,
    'message', 'Production batch corrected successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Stored Procedure: Correct Issued Stock
CREATE OR REPLACE FUNCTION correct_issued_stock(
  p_issue_id UUID,
  p_date DATE,
  p_seller_id UUID,
  p_cart_id UUID,
  p_items JSONB,
  p_notes TEXT,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_old_issue RECORD;
  v_new_issue_id UUID;
  v_new_issue_number TEXT;
  v_old_item RECORD;
  v_new_item JSONB;
  v_product_id UUID;
  v_issued_qty INTEGER;
  v_price_snapshot NUMERIC(12,2);
  v_comm_type TEXT;
  v_comm_val NUMERIC(12,2);
  v_seller_loc_id UUID;
  v_freezer_loc_id UUID;
  v_old_movement RECORD;
  v_closing RECORD;
  v_active_price RECORD;
  v_current_freezer_balance INTEGER;
  v_original_issued INTEGER;
  v_net_diff INTEGER;
  v_settlement_count INTEGER;
BEGIN
  -- 1. Owner Permission Check
  IF NOT (SELECT role = 'owner' FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Access Denied: Only Owners can correct stock issues.';
  END IF;

  -- 2. Validate Reason
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A valid correction reason of at least 5 characters is required.';
  END IF;

  -- 3. Lock & Load Original Issue
  SELECT * INTO v_old_issue FROM seller_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock issue record not found.';
  END IF;

  IF v_old_issue.is_current_version = false OR v_old_issue.status NOT IN ('issued', 'draft') THEN
    RAISE EXCEPTION 'Only active issued or draft records can be corrected.';
  END IF;

  -- 4. Block if already partially or fully settled
  SELECT COUNT(*) INTO v_settlement_count
  FROM seller_settlements
  WHERE seller_issue_id = p_issue_id AND status != 'cancelled';

  IF v_settlement_count > 0 THEN
    RAISE EXCEPTION 'This stock issue has a settlement. Correct or reverse the related settlement before changing this issue.';
  END IF;

  -- 5. Check Closed Day
  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_old_issue.issue_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Please reopen the business day first.', v_old_issue.issue_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', p_seller_id, 'Seller Cart');

  -- 6. Validate Available Freezer Stock for New Quantities
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_issued_qty := COALESCE((v_new_item->>'issued_quantity')::INTEGER, 0);

    SELECT COALESCE(issued_quantity, 0) INTO v_original_issued
    FROM seller_issue_items
    WHERE seller_issue_id = p_issue_id AND product_id = v_product_id;

    v_net_diff := v_issued_qty - COALESCE(v_original_issued, 0);

    IF v_net_diff > 0 THEN
      SELECT COALESCE(SUM(
        CASE WHEN destination_location_id = v_freezer_loc_id THEN quantity
             WHEN source_location_id = v_freezer_loc_id THEN -quantity
             ELSE 0 END
      ), 0) INTO v_current_freezer_balance
      FROM stock_movements
      WHERE product_id = v_product_id;

      IF v_current_freezer_balance < v_net_diff THEN
        RAISE EXCEPTION 'Insufficient freezer stock for product. Available: %, Required additional: %', v_current_freezer_balance, v_net_diff;
      END IF;
    END IF;
  END LOOP;

  -- 7. Reverse Original Stock Movements (from Seller back to Freezer)
  FOR v_old_movement IN
    SELECT * FROM stock_movements
    WHERE reference_table = 'seller_issues'
      AND reference_id = p_issue_id
      AND movement_type = 'seller_issued'
  LOOP
    INSERT INTO stock_movements (
      movement_date,
      product_id,
      source_location_id,
      destination_location_id,
      quantity,
      movement_type,
      reference_table,
      reference_id,
      reversal_of_movement_id,
      notes,
      created_by
    ) VALUES (
      NOW(),
      v_old_movement.product_id,
      v_old_movement.destination_location_id,
      v_old_movement.source_location_id,
      v_old_movement.quantity,
      'issue_reversal',
      'seller_issues',
      p_issue_id,
      v_old_movement.id,
      'Reversal for issue correction: ' || p_reason,
      p_user_id
    );
  END LOOP;

  -- 8. Create Revised Issue Record (Version N+1)
  v_new_issue_number := v_old_issue.issue_number || '-V' || (v_old_issue.version_number + 1);

  INSERT INTO seller_issues (
    issue_number,
    seller_id,
    cart_id,
    issue_date,
    status,
    issued_at,
    notes,
    version_number,
    is_current_version,
    correction_of_id,
    correction_reason,
    corrected_by,
    corrected_at,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_new_issue_number,
    p_seller_id,
    p_cart_id,
    p_date,
    'issued',
    NOW(),
    p_notes,
    v_old_issue.version_number + 1,
    true,
    v_old_issue.id,
    p_reason,
    p_user_id,
    NOW(),
    v_old_issue.created_by,
    v_old_issue.created_at,
    NOW()
  ) RETURNING id INTO v_new_issue_id;

  -- 9. Insert Revised Items with Price Snapshots and New Movements
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_issued_qty := COALESCE((v_new_item->>'issued_quantity')::INTEGER, 0);

    -- Get active product price snapshot
    SELECT selling_price, commission_type, commission_value
    INTO v_price_snapshot, v_comm_type, v_comm_val
    FROM product_prices
    WHERE product_id = v_product_id AND is_active = true
    LIMIT 1;

    INSERT INTO seller_issue_items (
      seller_issue_id,
      product_id,
      issued_quantity,
      unit_selling_price_snapshot,
      commission_type_snapshot,
      commission_value_snapshot
    ) VALUES (
      v_new_issue_id,
      v_product_id,
      v_issued_qty,
      COALESCE(v_price_snapshot, 0.00),
      COALESCE(v_comm_type, 'fixed'),
      COALESCE(v_comm_val, 0.00)
    );

    IF v_issued_qty > 0 THEN
      INSERT INTO stock_movements (
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
        NOW(),
        v_product_id,
        v_freezer_loc_id,
        v_seller_loc_id,
        v_issued_qty,
        'seller_issued',
        'seller_issues',
        v_new_issue_id,
        'Corrected stock issue: ' || v_new_issue_number,
        p_user_id
      );
    END IF;
  END LOOP;

  -- 10. Mark Old Issue as Superseded
  UPDATE seller_issues
  SET status = 'superseded',
      is_current_version = false,
      superseded_by_id = v_new_issue_id,
      updated_at = NOW()
  WHERE id = p_issue_id;

  -- 11. Write Audit Log
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    change_reason,
    user_id,
    created_at
  ) VALUES (
    'seller_issues',
    v_new_issue_id,
    'CORRECT_RECORD',
    jsonb_build_object('id', v_old_issue.id, 'issue_number', v_old_issue.issue_number),
    jsonb_build_object('id', v_new_issue_id, 'issue_number', v_new_issue_number, 'version', v_old_issue.version_number + 1),
    p_reason,
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_issue_id', v_new_issue_id,
    'new_issue_number', v_new_issue_number,
    'message', 'Stock issue corrected successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Stored Procedure: Correct Approved Settlement
CREATE OR REPLACE FUNCTION correct_approved_settlement(
  p_settlement_id UUID,
  p_date DATE,
  p_cash NUMERIC(12,2),
  p_upi NUMERIC(12,2),
  p_credit NUMERIC(12,2),
  p_items JSONB,
  p_notes TEXT,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_old_settlement RECORD;
  v_new_settlement_id UUID;
  v_new_settlement_number TEXT;
  v_new_item JSONB;
  v_item_id UUID;
  v_product_id UUID;
  v_issued_snap INTEGER;
  v_returned_qty INTEGER;
  v_damaged_qty INTEGER;
  v_comp_qty INTEGER;
  v_sold_qty INTEGER;
  v_price_snap NUMERIC(12,2);
  v_comm_val NUMERIC(12,2);
  v_comm_type TEXT;
  v_gross_sales NUMERIC(12,2) := 0.00;
  v_total_commission NUMERIC(12,2) := 0.00;
  v_item_gross NUMERIC(12,2);
  v_item_comm NUMERIC(12,2);
  v_expected_coll NUMERIC(12,2);
  v_total_received NUMERIC(12,2);
  v_shortage NUMERIC(12,2);
  v_seller_loc_id UUID;
  v_freezer_loc_id UUID;
  v_returned_loc_id UUID;
  v_damaged_loc_id UUID;
  v_comp_loc_id UUID;
  v_old_movement RECORD;
  v_closing RECORD;
BEGIN
  -- 1. Owner Permission Check
  IF NOT (SELECT role = 'owner' FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Access Denied: Only Owners can correct approved settlements.';
  END IF;

  -- 2. Validate Reason
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A valid correction reason of at least 5 characters is required.';
  END IF;

  -- 3. Lock & Load Original Settlement
  SELECT * INTO v_old_settlement FROM seller_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement record not found.';
  END IF;

  IF v_old_settlement.is_current_version = false THEN
    RAISE EXCEPTION 'Only current version of settlement can be corrected.';
  END IF;

  -- 4. Check Closed Day
  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_old_settlement.settlement_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Please reopen the business day first.', v_old_settlement.settlement_date;
  END IF;

  v_seller_loc_id := get_or_create_stock_location('seller', v_old_settlement.seller_id, 'Seller Cart');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_returned_loc_id := get_or_create_stock_location('returned', NULL, 'Returned Unsold');
  v_damaged_loc_id := get_or_create_stock_location('damaged', NULL, 'Damaged Stock');
  v_comp_loc_id := get_or_create_stock_location('complimentary', NULL, 'Complimentary Stock');

  -- 5. Reverse Old Stock Movements from Original Settlement
  FOR v_old_movement IN
    SELECT * FROM stock_movements
    WHERE reference_table = 'seller_settlements'
      AND reference_id = p_settlement_id
  LOOP
    INSERT INTO stock_movements (
      movement_date,
      product_id,
      source_location_id,
      destination_location_id,
      quantity,
      movement_type,
      reference_table,
      reference_id,
      reversal_of_movement_id,
      notes,
      created_by
    ) VALUES (
      NOW(),
      v_old_movement.product_id,
      v_old_movement.destination_location_id,
      v_old_movement.source_location_id,
      v_old_movement.quantity,
      'settlement_reversal',
      'seller_settlements',
      p_settlement_id,
      v_old_movement.id,
      'Reversal for settlement correction: ' || p_reason,
      p_user_id
    );
  END LOOP;

  -- 6. Calculate Gross Sales & Commission from Items
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_issued_snap := COALESCE((v_new_item->>'issued_quantity_snapshot')::INTEGER, 0);
    v_returned_qty := COALESCE((v_new_item->>'returned_quantity')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_new_item->>'damaged_quantity')::INTEGER, 0);
    v_comp_qty := COALESCE((v_new_item->>'complimentary_quantity')::INTEGER, 0);
    v_price_snap := COALESCE((v_new_item->>'selling_price_snapshot')::NUMERIC, 0.00);
    v_comm_val := COALESCE((v_new_item->>'commission_value_snapshot')::NUMERIC, 0.00);
    v_comm_type := COALESCE(v_new_item->>'commission_type_snapshot', 'fixed');

    v_sold_qty := v_issued_snap - v_returned_qty - v_damaged_qty - v_comp_qty;
    IF v_sold_qty < 0 THEN
      RAISE EXCEPTION 'Total returns, damages and complimentaries exceed issued quantity for item.';
    END IF;

    v_item_gross := ROUND(v_sold_qty * v_price_snap, 2);
    IF v_comm_type = 'percentage' THEN
      v_item_comm := ROUND((v_item_gross * v_comm_val) / 100.0, 2);
    ELSE
      v_item_comm := ROUND(v_sold_qty * v_comm_val, 2);
    END IF;

    v_gross_sales := v_gross_sales + v_item_gross;
    v_total_commission := v_total_commission + v_item_comm;
  END LOOP;

  v_expected_coll := v_gross_sales - v_total_commission;
  v_total_received := COALESCE(p_cash, 0.00) + COALESCE(p_upi, 0.00);
  v_shortage := v_expected_coll - (v_total_received + COALESCE(p_credit, 0.00));

  -- 7. Create Revised Settlement Record (Version N+1)
  v_new_settlement_number := v_old_settlement.settlement_number || '-V' || (v_old_settlement.version_number + 1);

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
    approved_at,
    version_number,
    is_current_version,
    correction_of_id,
    correction_reason,
    corrected_by,
    corrected_at,
    created_at,
    updated_at
  ) VALUES (
    v_new_settlement_number,
    v_old_settlement.seller_issue_id,
    v_old_settlement.seller_id,
    p_date,
    'approved',
    COALESCE(p_cash, 0.00),
    COALESCE(p_upi, 0.00),
    COALESCE(p_credit, 0.00),
    v_gross_sales,
    v_total_commission,
    v_expected_coll,
    v_total_received,
    COALESCE(p_credit, 0.00),
    GREATEST(0.00, v_shortage),
    p_notes,
    v_old_settlement.submitted_by,
    p_user_id,
    v_old_settlement.submitted_at,
    NOW(),
    v_old_settlement.version_number + 1,
    true,
    v_old_settlement.id,
    p_reason,
    p_user_id,
    NOW(),
    v_old_settlement.created_at,
    NOW()
  ) RETURNING id INTO v_new_settlement_id;

  -- 8. Insert Settlement Items and Replacement Stock Movements
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_issued_snap := COALESCE((v_new_item->>'issued_quantity_snapshot')::INTEGER, 0);
    v_returned_qty := COALESCE((v_new_item->>'returned_quantity')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_new_item->>'damaged_quantity')::INTEGER, 0);
    v_comp_qty := COALESCE((v_new_item->>'complimentary_quantity')::INTEGER, 0);
    v_price_snap := COALESCE((v_new_item->>'selling_price_snapshot')::NUMERIC, 0.00);
    v_comm_val := COALESCE((v_new_item->>'commission_value_snapshot')::NUMERIC, 0.00);
    v_comm_type := COALESCE(v_new_item->>'commission_type_snapshot', 'fixed');

    v_sold_qty := v_issued_snap - v_returned_qty - v_damaged_qty - v_comp_qty;
    v_item_gross := ROUND(v_sold_qty * v_price_snap, 2);
    IF v_comm_type = 'percentage' THEN
      v_item_comm := ROUND((v_item_gross * v_comm_val) / 100.0, 2);
    ELSE
      v_item_comm := ROUND(v_sold_qty * v_comm_val, 2);
    END IF;

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
      v_new_settlement_id,
      (v_new_item->>'seller_issue_item_id')::UUID,
      v_product_id,
      v_issued_snap,
      v_returned_qty,
      v_damaged_qty,
      v_comp_qty,
      v_sold_qty,
      v_price_snap,
      v_item_gross,
      v_item_comm,
      v_new_item->>'damage_reason',
      v_new_item->>'complimentary_reason'
    );

    -- Stock Movements for returned/damaged/complimentary items
    IF v_returned_qty > 0 THEN
      INSERT INTO stock_movements (movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by)
      VALUES (NOW(), v_product_id, v_seller_loc_id, v_freezer_loc_id, v_returned_qty, 'seller_returned', 'seller_settlements', v_new_settlement_id, 'Returned stock from settlement V' || (v_old_settlement.version_number + 1), p_user_id);
    END IF;

    IF v_damaged_qty > 0 THEN
      INSERT INTO stock_movements (movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by)
      VALUES (NOW(), v_product_id, v_seller_loc_id, v_damaged_loc_id, v_damaged_qty, 'damaged', 'seller_settlements', v_new_settlement_id, 'Damaged stock recorded in settlement V' || (v_old_settlement.version_number + 1), p_user_id);
    END IF;

    IF v_comp_qty > 0 THEN
      INSERT INTO stock_movements (movement_date, product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by)
      VALUES (NOW(), v_product_id, v_seller_loc_id, v_comp_loc_id, v_comp_qty, 'complimentary', 'seller_settlements', v_new_settlement_id, 'Complimentary stock recorded in settlement V' || (v_old_settlement.version_number + 1), p_user_id);
    END IF;
  END LOOP;

  -- 9. Mark Old Settlement as Superseded
  UPDATE seller_settlements
  SET status = 'superseded',
      is_current_version = false,
      superseded_by_id = v_new_settlement_id,
      updated_at = NOW()
  WHERE id = p_settlement_id;

  -- 10. Write Audit Log
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    change_reason,
    user_id,
    created_at
  ) VALUES (
    'seller_settlements',
    v_new_settlement_id,
    'CORRECT_RECORD',
    jsonb_build_object('id', v_old_settlement.id, 'settlement_number', v_old_settlement.settlement_number, 'gross_sales', v_old_settlement.gross_sales),
    jsonb_build_object('id', v_new_settlement_id, 'settlement_number', v_new_settlement_number, 'gross_sales', v_gross_sales, 'version', v_old_settlement.version_number + 1),
    p_reason,
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_settlement_id', v_new_settlement_id,
    'new_settlement_number', v_new_settlement_number,
    'message', 'Settlement corrected successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
