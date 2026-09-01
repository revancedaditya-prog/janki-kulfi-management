-- Janki Kulfi Management Schema Migration 006
-- Production Batch Atomic Transaction RPC

CREATE OR REPLACE FUNCTION create_production_batch_transaction(
  p_date DATE,
  p_cost NUMERIC(12,2),
  p_notes TEXT,
  p_items JSONB,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_batch_id UUID;
  v_batch_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_produced_qty INTEGER;
  v_damaged_qty INTEGER;
  v_saleable_qty INTEGER;
  v_allocated_cost NUMERIC(12,2);
  v_unit_cost NUMERIC(12,2);
  v_total_saleable INTEGER := 0;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
BEGIN
  -- Generate batch number (e.g. BAT-20260901-1234)
  v_batch_number := 'BAT-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

  -- Create production batch (completed)
  INSERT INTO production_batches (
    batch_number,
    production_date,
    status,
    total_ingredient_cost,
    notes,
    completed_at,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_batch_number,
    p_date,
    'completed',
    COALESCE(p_cost, 0.00),
    p_notes,
    NOW(),
    p_user_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_batch_id;

  -- Ensure locations exist
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');

  -- First pass: calculate total saleable pieces for cost allocation
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_produced_qty := COALESCE((v_item->>'produced_quantity')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_item->>'damaged_quantity')::INTEGER, 0);
    IF v_damaged_qty > v_produced_qty THEN
      RAISE EXCEPTION 'Damaged quantity (%) cannot exceed produced quantity (%)', v_damaged_qty, v_produced_qty;
    END IF;
    v_total_saleable := v_total_saleable + (v_produced_qty - v_damaged_qty);
  END LOOP;

  -- Second pass: insert items & stock movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_produced_qty := COALESCE((v_item->>'produced_quantity')::INTEGER, 0);
    v_damaged_qty := COALESCE((v_item->>'damaged_quantity')::INTEGER, 0);
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
      v_batch_id,
      v_product_id,
      v_produced_qty,
      v_damaged_qty,
      v_saleable_qty,
      v_allocated_cost,
      v_unit_cost,
      v_item->>'notes'
    );

    -- Stock Movement into Main Freezer
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
        'production_in',
        'production_batches',
        v_batch_id,
        'Daily Production: ' || v_batch_number,
        p_user_id
      );
    END IF;
  END LOOP;

  -- Audit log
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    change_reason,
    user_id,
    created_at
  ) VALUES (
    'production_batches',
    v_batch_id,
    'CREATE_BATCH',
    jsonb_build_object('batch_number', v_batch_number, 'cost', p_cost, 'items_count', jsonb_array_length(p_items)),
    'Completed production batch recorded',
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'message', 'Production batch completed successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
