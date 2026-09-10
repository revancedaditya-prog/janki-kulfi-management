-- ============================================================================
-- Migration 033: Disambiguate Overloaded RPC Functions & Fix PostgREST Ambiguity
-- ============================================================================

-- 1. Dynamically drop all legacy / overloaded signatures of RPC functions in schema public
DO $$
DECLARE
  f_name TEXT;
  r RECORD;
BEGIN
  FOR f_name IN
    SELECT unnest(ARRAY[
      'complete_production_with_recipe_transaction',
      'complete_production_with_raw_materials_transaction',
      'confirm_material_purchase_atomic',
      'confirm_material_purchase_transaction',
      'reverse_material_purchase_transaction',
      'correct_raw_material_stock_transaction',
      'reconcile_freezer_stock_transaction',
      'adjust_freezer_stock_transaction',
      'delete_production_batch_transaction',
      'delete_ingredient_transaction',
      'activate_recipe_version_transaction',
      'delete_recipe_version_transaction',
      'correct_completed_production',
      'delete_seller_issue_transaction',
      'delete_seller_settlement_transaction',
      'delete_or_archive_expense_head',
      'correct_paid_expense',
      'copy_previous_month_fixed_expenses',
      'add_lpg_cylinder_transaction',
      'record_lpg_cylinder_movement_transaction',
      'correct_lpg_cylinder_movement_transaction',
      'delete_or_archive_lpg_cylinder_transaction',
      'reactivate_lpg_cylinder_transaction',
      'approve_physical_stock_count_transaction'
    ])
  LOOP
    FOR r IN (
      SELECT p.oid::regprocedure AS func_signature
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = f_name
    ) LOOP
      BEGIN
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE;';
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;

-- 2. Ensure column defaults and trigger on production_items
ALTER TABLE IF EXISTS public.production_items 
  ALTER COLUMN produced_quantity SET DEFAULT 0,
  ALTER COLUMN damaged_quantity SET DEFAULT 0,
  ALTER COLUMN saleable_quantity SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.trg_fn_calculate_production_item_saleable()
RETURNS TRIGGER AS $$
BEGIN
  NEW.produced_quantity := COALESCE(NEW.produced_quantity, 0);
  NEW.damaged_quantity := COALESCE(NEW.damaged_quantity, 0);
  IF NEW.saleable_quantity IS NULL THEN
    NEW.saleable_quantity := GREATEST(0, NEW.produced_quantity - NEW.damaged_quantity);
  END IF;
  IF NEW.allocated_ingredient_cost IS NULL THEN
    NEW.allocated_ingredient_cost := 0.00;
  END IF;
  IF NEW.unit_production_cost IS NULL THEN
    NEW.unit_production_cost := 0.00;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_production_items_saleable ON public.production_items;
CREATE TRIGGER trg_production_items_saleable
BEFORE INSERT OR UPDATE ON public.production_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_calculate_production_item_saleable();

-- 3. Definitive, single signature for complete_production_with_recipe_transaction
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
) RETURNS JSONB AS $$
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
BEGIN
  SET search_path = public, extensions, pg_temp;

  -- 1. Caller Identification (Safely handle UUID or string)
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
    RAISE EXCEPTION 'Produced quantity must be greater than 0';
  END IF;

  IF v_damaged_qty < 0 THEN
    v_damaged_qty := 0;
  END IF;

  IF v_damaged_qty > v_produced_qty THEN
    RAISE EXCEPTION 'Damaged quantity (% pcs) cannot exceed produced quantity (% pcs)',
      v_damaged_qty, v_produced_qty;
  END IF;

  v_saleable_qty := GREATEST(0, v_produced_qty - v_damaged_qty);

  -- 4. Lock & Validate Product
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % does not exist', p_product_id;
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
    RAISE EXCEPTION 'No active recipe configured for product "%" (%)',
      v_product.name_hi, v_product.name_en;
  END IF;

  v_expected_yield := COALESCE(v_recipe.expected_yield_pieces, v_recipe.standard_output_pieces, 100);
  IF v_expected_yield <= 0 THEN
    v_expected_yield := 100;
  END IF;

  -- Verify recipe has items
  IF NOT EXISTS (SELECT 1 FROM public.recipe_items WHERE recipe_id = v_recipe.id) THEN
    RAISE EXCEPTION 'Active recipe has no ingredient items configured';
  END IF;

  v_scale_factor := v_produced_qty::NUMERIC / v_expected_yield::NUMERIC;

  -- 6. Process Recipe Items
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
      COALESCE(i.storage_location, 'Main Store') AS storage_location
    FROM public.recipe_items ri
    JOIN public.ingredients i ON ri.ingredient_id = i.id
    WHERE ri.recipe_id = v_recipe.id
    ORDER BY ri.sort_order, ri.id
  LOOP
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

    -- Unit conversion to base unit
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
    ELSE
      v_item_base_qty := v_actual_item_qty;
    END IF;

    -- Unit conversion to rate unit
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
      'expected_qty', v_std_item_qty,
      'actual_qty', v_actual_item_qty,
      'unit', v_rec_item.unit,
      'base_qty', v_item_base_qty,
      'rate_snapshot', v_item_rate,
      'rate_unit', v_rec_item.rate_unit,
      'calculated_cost', v_item_cost,
      'is_packaging', (v_rec_item.category = 'packaging'),
      'variance_reason', v_variance_reason,
      'storage_location', COALESCE(v_rec_item.storage_location, 'Main Raw Material Store')
    ));
  END LOOP;

  IF v_has_actual_override THEN
    v_costing_source := 'actual_override';
  END IF;

  -- 7. Final Cost Breakdown
  v_total_batch_cost := v_total_ingredient_cost + COALESCE(p_lpg_cost, 0.00);
  IF v_produced_qty > 0 THEN
    v_cost_per_piece := ROUND(v_total_batch_cost / v_produced_qty, 2);
  END IF;

  -- 8. Create Production Batch
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

  -- 9. Insert Production Item (Guaranteed not null)
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

  -- 10. Insert Batch Ingredient Snapshots & Raw Material Movements
  FOR v_actual_override_entry IN SELECT * FROM jsonb_array_elements(v_calculated_ingredients) LOOP
    INSERT INTO public.production_batch_ingredients (
      batch_id,
      ingredient_id,
      ingredient_name_snapshot,
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
      (v_actual_override_entry->>'ingredient_id')::UUID,
      v_actual_override_entry->>'ingredient_name',
      (v_actual_override_entry->>'expected_qty')::NUMERIC,
      (v_actual_override_entry->>'actual_qty')::NUMERIC,
      v_actual_override_entry->>'unit',
      (v_actual_override_entry->>'base_qty')::NUMERIC,
      (v_actual_override_entry->>'rate_snapshot')::NUMERIC,
      v_actual_override_entry->>'rate_unit',
      (v_actual_override_entry->>'calculated_cost')::NUMERIC,
      (v_actual_override_entry->>'is_packaging')::BOOLEAN,
      v_actual_override_entry->>'variance_reason'
    );

    -- Stock Movement (Raw Material Consumption)
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
      (v_actual_override_entry->>'ingredient_id')::UUID,
      'production_consumption',
      -ABS((v_actual_override_entry->>'base_qty')::NUMERIC),
      COALESCE((SELECT base_unit FROM public.ingredients WHERE id = (v_actual_override_entry->>'ingredient_id')::UUID), 'kg'),
      (v_actual_override_entry->>'rate_snapshot')::NUMERIC,
      -ABS((v_actual_override_entry->>'calculated_cost')::NUMERIC),
      'production_batches',
      v_batch_id,
      COALESCE(p_production_date, CURRENT_DATE),
      v_actual_override_entry->>'storage_location',
      'Production Floor',
      'Batch consumption for ' || v_batch_number,
      v_caller_id,
      v_caller_id
    );
  END LOOP;

  -- 11. Finished Goods Stock Movement (into Main Freezer)
  SELECT id INTO v_prod_loc_id FROM public.stock_locations WHERE type = 'production' LIMIT 1;
  SELECT id INTO v_freezer_loc_id FROM public.stock_locations WHERE type = 'warehouse' OR is_default_freezer = true LIMIT 1;

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
      performed_by,
      created_by
    ) VALUES (
      NOW(),
      p_product_id,
      v_prod_loc_id,
      v_freezer_loc_id,
      v_saleable_qty,
      'production_completed',
      'production_batches',
      v_batch_id,
      'Batch completed: ' || v_batch_number,
      v_caller_id,
      v_caller_id
    );
  END IF;

  -- 12. Audit Log
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
    'total_ingredient_cost', v_total_ingredient_cost,
    'cost_per_piece', v_cost_per_piece,
    'message', 'उत्पादन बैच सफलतापूर्वक दर्ज हुआ (Batch ' || v_batch_number || ')'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Definitive, single signature for reverse_material_purchase_transaction
CREATE OR REPLACE FUNCTION public.reverse_material_purchase_transaction(
  p_purchase_id UUID,
  p_reason TEXT DEFAULT 'Purchase reversed by user',
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := NULL;
  v_purchase RECORD;
  v_item RECORD;
BEGIN
  SET search_path = public, extensions, pg_temp;

  IF auth.uid() IS NOT NULL THEN
    v_caller_id := auth.uid();
  ELSIF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_caller_id := p_user_id::UUID;
  END IF;

  SELECT * INTO v_purchase FROM public.material_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase % not found', p_purchase_id;
  END IF;

  IF v_purchase.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Purchase is already cancelled');
  END IF;

  -- Reverse movements
  FOR v_item IN SELECT * FROM public.material_purchase_items WHERE purchase_id = p_purchase_id LOOP
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
      v_item.ingredient_id,
      'adjustment_out',
      -ABS(COALESCE(v_item.base_quantity, v_item.total_received_quantity, v_item.quantity, 0.000)),
      COALESCE(v_item.base_unit, (SELECT base_unit FROM public.ingredients WHERE id = v_item.ingredient_id), 'kg'),
      COALESCE(v_item.unit_acquisition_cost, v_item.unit_price, 0.0000),
      -ABS(COALESCE(v_item.net_item_cost, v_item.total_amount, 0.00)),
      'material_purchases',
      p_purchase_id,
      CURRENT_DATE,
      'Main Store',
      'Supplier',
      COALESCE(p_reason, 'Reversal of purchase ' || COALESCE(v_purchase.purchase_number, p_purchase_id::TEXT)),
      v_caller_id,
      v_caller_id
    );
  END LOOP;

  UPDATE public.material_purchases
  SET status = 'cancelled',
      notes = COALESCE(notes || E'\n', '') || '[Cancelled]: ' || COALESCE(p_reason, 'Reversed by user'),
      updated_at = NOW()
  WHERE id = p_purchase_id;

  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    reason,
    performed_by
  ) VALUES (
    'material_purchases',
    p_purchase_id,
    'REVERSE_MATERIAL_PURCHASE',
    row_to_json(v_purchase)::jsonb,
    jsonb_build_object('status', 'cancelled', 'reason', p_reason),
    p_reason,
    v_caller_id
  );

  RETURN jsonb_build_object('success', true, 'message', 'Material purchase reversed successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Recreate confirm_material_purchase_atomic with single signature
CREATE OR REPLACE FUNCTION public.confirm_material_purchase_atomic(
  p_purchase_id UUID,
  p_items JSONB,
  p_payment_mode TEXT,
  p_paid_amount NUMERIC,
  p_supplier_id UUID DEFAULT NULL,
  p_purchase_date DATE DEFAULT CURRENT_DATE,
  p_invoice_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := NULL;
  v_user_role TEXT;
  v_purchase RECORD;
  v_existing_total NUMERIC(12,2) := 0.00;
  v_existing_paid NUMERIC(12,2) := 0.00;
  v_item_elem JSONB;
  v_ingredient_id UUID;
  v_qty NUMERIC(12,3);
  v_free_qty NUMERIC(12,3);
  v_total_rec_qty NUMERIC(12,3);
  v_base_qty NUMERIC(12,3);
  v_unit_price NUMERIC(12,2);
  v_discount NUMERIC(12,2);
  v_tax NUMERIC(12,2);
  v_net_cost NUMERIC(12,2);
  v_unit_acq_cost NUMERIC(12,4);
  v_lot_num TEXT;
  v_mfg_date DATE;
  v_exp_date DATE;
  v_unit TEXT;
  v_base_unit TEXT;
  v_conv_factor NUMERIC(10,4);
  v_stor_loc TEXT;
  v_total_purchase_cost NUMERIC(12,2) := 0.00;
  v_paid_amt NUMERIC(12,2);
  v_credit_amt NUMERIC(12,2);
  v_pur_date DATE;
  v_pur_num TEXT;
  v_item_id UUID;
  v_mvt_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_processed_items INT := 0;
BEGIN
  SET search_path = public, extensions, pg_temp;

  -- 1. Identify Caller Safely
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
    SELECT id, purchase_number, total_amount, paid_amount 
    INTO v_purchase 
    FROM public.material_purchases 
    WHERE idempotency_key = p_idempotency_key 
    LIMIT 1;

    IF v_purchase.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'purchase_id', v_purchase.id,
        'purchase_number', v_purchase.purchase_number,
        'total_amount', COALESCE(v_purchase.total_amount, 0.00),
        'paid_amount', COALESCE(v_purchase.paid_amount, 0.00),
        'message', 'Purchase already confirmed (Idempotent replay)'
      );
    END IF;
  END IF;

  -- 3. Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Purchase must contain at least one item';
  END IF;

  v_pur_date := COALESCE(p_purchase_date, CURRENT_DATE);
  v_paid_amt := COALESCE(p_paid_amount, 0.00);

  -- 4. Check / Lock Existing Purchase or Generate Number
  IF p_purchase_id IS NOT NULL THEN
    SELECT * INTO v_purchase FROM public.material_purchases WHERE id = p_purchase_id FOR UPDATE;
    IF v_purchase.id IS NOT NULL THEN
      v_pur_num := v_purchase.purchase_number;
    END IF;
  END IF;

  IF v_pur_num IS NULL THEN
    v_pur_num := 'PUR-' || TO_CHAR(v_pur_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
  END IF;

  -- Reset total purchase cost accumulator
  v_total_purchase_cost := 0.00;

  -- Delete existing items/movements if updating an existing unfinalized purchase
  IF v_purchase.id IS NOT NULL THEN
    DELETE FROM public.raw_material_movements 
    WHERE (reference_table = 'material_purchases' AND reference_id = v_purchase.id)
       OR (reference_id = v_purchase.id AND movement_type = 'purchase_received');
    DELETE FROM public.material_purchase_items WHERE purchase_id = v_purchase.id;
  END IF;

  -- 5. Process and Insert Items
  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ingredient_id := (v_item_elem->>'ingredient_id')::UUID;
    v_qty := COALESCE((v_item_elem->>'quantity')::NUMERIC, 0.000);
    v_free_qty := COALESCE((v_item_elem->>'free_quantity')::NUMERIC, 0.000);
    v_unit_price := COALESCE((v_item_elem->>'unit_price')::NUMERIC, 0.00);
    v_discount := COALESCE((v_item_elem->>'discount')::NUMERIC, 0.00);
    v_tax := COALESCE((v_item_elem->>'tax')::NUMERIC, 0.00);
    v_lot_num := v_item_elem->>'lot_number';
    v_mfg_date := CASE WHEN v_item_elem->>'manufacturing_date' IS NOT NULL AND v_item_elem->>'manufacturing_date' != '' THEN (v_item_elem->>'manufacturing_date')::DATE ELSE NULL END;
    v_exp_date := CASE WHEN v_item_elem->>'expiry_date' IS NOT NULL AND v_item_elem->>'expiry_date' != '' THEN (v_item_elem->>'expiry_date')::DATE ELSE NULL END;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity for item must be greater than 0';
    END IF;

    -- Load ingredient details
    SELECT base_unit, COALESCE(conversion_factor, 1.0000), COALESCE(storage_location, 'Main Store')
    INTO v_base_unit, v_conv_factor, v_stor_loc
    FROM public.ingredients
    WHERE id = v_ingredient_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ingredient % not found in master database', v_ingredient_id;
    END IF;

    v_unit := COALESCE(v_item_elem->>'unit', v_base_unit);
    v_total_rec_qty := v_qty + v_free_qty;

    -- Base quantity calculation
    IF v_unit = v_base_unit THEN
      v_base_qty := v_total_rec_qty;
    ELSIF v_conv_factor > 0 THEN
      v_base_qty := v_total_rec_qty * v_conv_factor;
    ELSE
      v_base_qty := v_total_rec_qty;
    END IF;

    -- Financial costing calculation
    v_net_cost := ROUND((v_qty * v_unit_price) - v_discount + v_tax, 2);
    IF v_net_cost < 0 THEN
      v_net_cost := 0.00;
    END IF;

    IF v_base_qty > 0 THEN
      v_unit_acq_cost := ROUND(v_net_cost / v_base_qty, 4);
    ELSE
      v_unit_acq_cost := 0.0000;
    END IF;

    v_total_purchase_cost := v_total_purchase_cost + v_net_cost;

    -- Upsert Purchase Record Header if not created yet
    IF v_purchase.id IS NULL THEN
      v_credit_amt := GREATEST(0.00, v_total_purchase_cost - v_paid_amt);

      INSERT INTO public.material_purchases (
        purchase_number,
        purchase_date,
        supplier_id,
        invoice_number,
        total_amount,
        paid_amount,
        credit_amount,
        payment_mode,
        payment_status,
        status,
        notes,
        idempotency_key,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        v_pur_num,
        v_pur_date,
        p_supplier_id,
        p_invoice_number,
        COALESCE(v_total_purchase_cost, 0.00),
        v_paid_amt,
        v_credit_amt,
        COALESCE(p_payment_mode, 'cash'),
        CASE WHEN v_paid_amt >= v_total_purchase_cost THEN 'paid' WHEN v_paid_amt > 0 THEN 'partial' ELSE 'unpaid' END,
        'received',
        p_notes,
        p_idempotency_key,
        v_caller_id,
        v_now,
        v_now
      ) RETURNING * INTO v_purchase;
    END IF;

    -- Insert Purchase Item
    INSERT INTO public.material_purchase_items (
      purchase_id,
      ingredient_id,
      quantity,
      unit,
      free_quantity,
      total_received_quantity,
      base_quantity,
      base_unit,
      unit_price,
      discount,
      tax,
      net_item_cost,
      unit_acquisition_cost,
      total_amount,
      lot_number,
      manufacturing_date,
      expiry_date
    ) VALUES (
      v_purchase.id,
      v_ingredient_id,
      v_qty,
      v_unit,
      v_free_qty,
      v_total_rec_qty,
      v_base_qty,
      v_base_unit,
      v_unit_price,
      v_discount,
      v_tax,
      v_net_cost,
      v_unit_acq_cost,
      v_net_cost,
      v_lot_num,
      v_mfg_date,
      v_exp_date
    ) RETURNING id INTO v_item_id;

    -- Insert Raw Material Movement
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
      v_ingredient_id,
      'purchase_received',
      ABS(v_base_qty),
      v_base_unit,
      v_unit_acq_cost,
      ABS(v_net_cost),
      'material_purchases',
      v_purchase.id,
      v_pur_date,
      'Supplier',
      v_stor_loc,
      'Purchase ' || v_pur_num,
      v_caller_id,
      v_caller_id
    ) RETURNING id INTO v_mvt_id;

    -- Update Ingredient Rate
    UPDATE public.ingredients
    SET current_rate = v_unit_acq_cost,
        rate_unit = v_base_unit,
        updated_at = v_now
    WHERE id = v_ingredient_id;

    v_processed_items := v_processed_items + 1;
  END LOOP;

  -- 6. Final Header Total Amount Reconciliation
  v_credit_amt := GREATEST(0.00, v_total_purchase_cost - v_paid_amt);

  UPDATE public.material_purchases
  SET total_amount = COALESCE(v_total_purchase_cost, 0.00),
      paid_amount = v_paid_amt,
      credit_amount = v_credit_amt,
      payment_status = CASE WHEN v_paid_amt >= v_total_purchase_cost THEN 'paid' WHEN v_paid_amt > 0 THEN 'partial' ELSE 'unpaid' END,
      status = 'received',
      purchase_date = v_pur_date,
      supplier_id = p_supplier_id,
      invoice_number = p_invoice_number,
      payment_mode = COALESCE(p_payment_mode, payment_mode),
      notes = COALESCE(p_notes, notes),
      idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
      updated_at = v_now
  WHERE id = v_purchase.id;

  -- 7. Audit Log
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    new_data,
    reason,
    performed_by
  ) VALUES (
    'material_purchases',
    v_purchase.id,
    'CONFIRM_MATERIAL_PURCHASE_ATOMIC',
    jsonb_build_object(
      'purchase_number', v_pur_num,
      'total_amount', v_total_purchase_cost,
      'paid_amount', v_paid_amt,
      'items_count', v_processed_items
    ),
    'Atomic purchase confirmed with real-time inventory increment',
    v_caller_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase.id,
    'purchase_number', v_pur_num,
    'total_amount', v_total_purchase_cost,
    'paid_amount', v_paid_amt,
    'credit_amount', v_credit_amt,
    'items_count', v_processed_items,
    'message', 'कच्चा माल खरीद और स्टॉक सफलतापूर्वक दर्ज हुआ (Purchase ' || v_pur_num || ')'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant Permissions & Reload Schema
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
