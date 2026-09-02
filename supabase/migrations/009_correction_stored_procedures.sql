-- Complete SQL script to install `correct_completed_production`, `correct_issued_stock`, and `correct_approved_settlement`

-- 1. Helper function for stock location
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

-- 2. Extend Status and Movement Enums if needed
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

-- 3. Add Versioning Columns to production_batches
ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS correction_of_id UUID REFERENCES production_batches(id),
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES production_batches(id),
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

-- 4. Stored Procedure: correct_completed_production
CREATE OR REPLACE FUNCTION correct_completed_production(
  p_batch_id UUID,
  p_cost NUMERIC DEFAULT 0.00,
  p_date DATE DEFAULT CURRENT_DATE,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT '',
  p_reason TEXT DEFAULT '',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_old_batch RECORD;
  v_new_batch_id UUID;
  v_new_batch_number TEXT;
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
  v_closing RECORD;
  v_original_saleable INTEGER;
  v_net_stock_diff INTEGER;
BEGIN
  -- 1. Validate Reason
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A valid explanation is required for correcting a completed batch.';
  END IF;

  -- 2. Lock & Load Original Batch
  SELECT * INTO v_old_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found.';
  END IF;

  IF v_old_batch.status != 'completed' OR v_old_batch.is_current_version = false THEN
    RAISE EXCEPTION 'Only active, completed production batches can be corrected.';
  END IF;

  -- 3. Check Closed Day
  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_old_batch.production_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. You must reopen the business day first before correcting this record.', v_old_batch.production_date;
  END IF;

  -- 4. Calculate Total Saleable Pieces
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_produced_qty := COALESCE((v_new_item->>'produced_quantity')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_new_item->>'damaged_quantity')::INTEGER, 0);
    IF v_damaged_qty > v_produced_qty THEN
      RAISE EXCEPTION 'Damaged quantity (%) cannot exceed produced quantity (%)', v_damaged_qty, v_produced_qty;
    END IF;
    v_total_saleable := v_total_saleable + (v_produced_qty - v_damaged_qty);
  END LOOP;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');

  -- Generate new revision batch number
  v_new_batch_number := split_part(v_old_batch.batch_number, '-R', 1) || '-R' || (COALESCE(v_old_batch.version_number, 1) + 1);

  -- 5. Insert New Revised Production Batch
  INSERT INTO production_batches (
    batch_number,
    production_date,
    status,
    total_ingredient_cost,
    notes,
    version_number,
    is_current_version,
    correction_of_id,
    correction_reason,
    corrected_by,
    corrected_at,
    completed_at,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_new_batch_number,
    p_date,
    'completed',
    COALESCE(p_cost, 0.00),
    p_notes,
    COALESCE(v_old_batch.version_number, 1) + 1,
    true,
    p_batch_id,
    p_reason,
    p_user_id,
    NOW(),
    NOW(),
    v_old_batch.created_by,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_batch_id;

  -- 6. Insert Revised Items & Rebalance Stock
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_new_item->>'product_id')::UUID;
    v_produced_qty := COALESCE((v_new_item->>'produced_quantity')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_new_item->>'damaged_quantity')::INTEGER, 0);
    v_saleable_qty := v_produced_qty - v_damaged_qty;

    IF v_total_saleable > 0 AND v_saleable_qty > 0 THEN
      v_allocated_cost := ROUND((COALESCE(p_cost, 0.00) * v_saleable_qty::NUMERIC / v_total_saleable::NUMERIC), 2);
      v_unit_cost := ROUND(v_allocated_cost / v_saleable_qty::NUMERIC, 2);
    ELSE
      v_allocated_cost := 0.00;
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

    SELECT COALESCE(saleable_quantity, 0) INTO v_original_saleable
    FROM production_items
    WHERE batch_id = p_batch_id AND product_id = v_product_id;

    v_net_stock_diff := v_saleable_qty - COALESCE(v_original_saleable, 0);

    IF v_net_stock_diff != 0 THEN
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
        CASE WHEN v_net_stock_diff > 0 THEN v_prod_loc_id ELSE v_freezer_loc_id END,
        CASE WHEN v_net_stock_diff > 0 THEN v_freezer_loc_id ELSE v_prod_loc_id END,
        ABS(v_net_stock_diff),
        'correction_replacement',
        'production_batches',
        v_new_batch_id,
        'Stock adjustment for production batch correction ' || v_old_batch.batch_number || ' -> ' || v_new_batch_number,
        p_user_id
      );
    END IF;
  END LOOP;

  -- 7. Mark Old Batch as Superseded
  UPDATE production_batches
  SET
    status = 'superseded',
    is_current_version = false,
    superseded_by_id = v_new_batch_id,
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- 8. Audit Log
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
    'CORRECT_COMPLETED_PRODUCTION',
    jsonb_build_object('id', p_batch_id, 'batch_number', v_old_batch.batch_number, 'cost', v_old_batch.total_ingredient_cost),
    jsonb_build_object('id', v_new_batch_id, 'batch_number', v_new_batch_number, 'cost', p_cost),
    p_reason,
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_batch_id', v_new_batch_id,
    'new_batch_number', v_new_batch_number,
    'version_number', COALESCE(v_old_batch.version_number, 1) + 1,
    'message', 'Production batch corrected successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
