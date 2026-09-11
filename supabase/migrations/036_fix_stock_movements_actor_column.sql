-- ============================================================================
-- Migration 036: Fix stock_movements Actor Column in complete_production_with_recipe_transaction
-- ============================================================================
-- Purpose:
--   Fix error: column "performed_by" of relation "stock_movements" does not exist.
--   Inside only the finished-goods INSERT INTO public.stock_movements:
--     1. Remove performed_by target column
--     2. Remove its matching first v_caller_id value
--     3. Keep created_by with one v_caller_id value
--   audit_logs.performed_by and raw_material_movements inserts remain untouched.
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
  v_calc_item JSONB;
BEGIN
  SET search_path = public, extensions, pg_temp;

  -- 1. Caller Identification (Safely handle UUID or text like 'usr-owner-001')
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
      NOW(),
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
    'total_ingredient_cost', v_total_ingredient_cost,
    'cost_per_piece', v_cost_per_piece,
    'message', 'उत्पादन बैच सफलतापूर्वक दर्ज हुआ (Batch ' || v_batch_number || ')'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions & Schema Reload
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
