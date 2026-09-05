-- Migration: 019_production_recipe_refactor.sql
-- Description: Recipe Master (Draft/Active/Archived), Authoritative Production-Recipe Atomic Deduction RPC, Safe Deletion Rules, and Stock Correction

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Recipe Status & Yield Enhancements
DO $$
BEGIN
  -- Add status column to recipes if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recipes' AND column_name = 'status'
  ) THEN
    ALTER TABLE recipes ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived'));
  END IF;

  -- Add expected_yield_pieces column alias/ensure on recipes if needed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recipes' AND column_name = 'expected_yield_pieces'
  ) THEN
    ALTER TABLE recipes ADD COLUMN expected_yield_pieces INTEGER NOT NULL DEFAULT 100 CHECK (expected_yield_pieces > 0);
  END IF;
END $$;

-- Synchronize expected_yield_pieces with standard_output_pieces
UPDATE recipes 
SET expected_yield_pieces = standard_output_pieces 
WHERE expected_yield_pieces <> standard_output_pieces;

-- Backfill existing recipes status based on is_default
UPDATE recipes 
SET status = CASE WHEN is_default = true THEN 'active' ELSE 'archived' END
WHERE status IS NULL OR status = 'draft';

-- Create partial unique index: Only one Active recipe per product
DROP INDEX IF EXISTS idx_unique_active_recipe_per_product;
CREATE UNIQUE INDEX idx_unique_active_recipe_per_product 
ON recipes (product_id) 
WHERE status = 'active';

-- 2. Production Batches Enhancements (Costing Source, Idempotency, Snapshots)
DO $$
BEGIN
  ALTER TABLE production_batches 
    ADD COLUMN IF NOT EXISTS costing_source TEXT NOT NULL DEFAULT 'recipe_calculated' 
    CHECK (costing_source IN ('recipe_calculated', 'legacy_manual', 'actual_override'));

  ALTER TABLE production_batches 
    ADD COLUMN IF NOT EXISTS idempotency_key UUID;

  ALTER TABLE production_batches 
    ADD COLUMN IF NOT EXISTS expected_yield_snapshot INTEGER;

  ALTER TABLE production_batches 
    ADD COLUMN IF NOT EXISTS recipe_version_snapshot INTEGER;

  ALTER TABLE production_batches 
    ADD COLUMN IF NOT EXISTS lpg_cost NUMERIC(12,2) DEFAULT 0.00;

  ALTER TABLE production_batches 
    ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Create Unique Index on idempotency_key for production_batches
DROP INDEX IF EXISTS idx_production_batches_idempotency;
CREATE UNIQUE INDEX idx_production_batches_idempotency 
ON production_batches (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 3. Production Batch Ingredients Enhancements (Variance & Audit)
DO $$
BEGIN
  ALTER TABLE production_batch_ingredients
    ADD COLUMN IF NOT EXISTS expected_quantity NUMERIC(12,3) DEFAULT 0.000,
    ADD COLUMN IF NOT EXISTS actual_quantity NUMERIC(12,3) DEFAULT 0.000,
    ADD COLUMN IF NOT EXISTS variance_reason TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 4. Backfill Historical Production Batches without recipe_id
UPDATE production_batches
SET costing_source = 'legacy_manual'
WHERE recipe_id IS NULL AND costing_source <> 'legacy_manual';

-- 5. Foreign Key Protection: Ensure production_batches -> recipes is ON DELETE RESTRICT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'production_batches_recipe_id_fkey' AND table_name = 'production_batches'
  ) THEN
    ALTER TABLE production_batches DROP CONSTRAINT production_batches_recipe_id_fkey;
  END IF;
  
  ALTER TABLE production_batches
    ADD CONSTRAINT production_batches_recipe_id_fkey
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE RESTRICT;
END $$;


-- 6. RPC: Atomic Recipe-Based Production Completion & Raw Material Deduction
CREATE OR REPLACE FUNCTION complete_production_with_recipe_transaction(
  p_production_date DATE,
  p_product_id UUID,
  p_produced_quantity INTEGER,
  p_damaged_quantity INTEGER DEFAULT 0,
  p_recipe_id UUID DEFAULT NULL,
  p_actual_ingredients JSONB DEFAULT NULL, -- array of { ingredient_id, actual_quantity, unit, reason }
  p_notes TEXT DEFAULT '',
  p_lpg_cost NUMERIC(12,2) DEFAULT 0.00,
  p_overhead_costs JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(p_user_id, auth.uid());
  v_user_role TEXT;
  v_product RECORD;
  v_recipe RECORD;
  v_rec_item RECORD;
  v_ing RECORD;
  v_batch_id UUID;
  v_batch_number TEXT;
  v_saleable_qty INTEGER;
  v_expected_yield NUMERIC(12,3);
  v_std_item_qty NUMERIC(12,3);
  v_req_item_qty NUMERIC(12,3);
  v_actual_item_qty NUMERIC(12,3);
  v_item_base_qty NUMERIC(12,3);
  v_item_rate_qty NUMERIC(12,4);
  v_avail_stock NUMERIC(12,3);
  v_shortage NUMERIC(12,3);
  v_item_rate NUMERIC(12,4);
  v_item_cost NUMERIC(12,2);
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
  -- 1. Authentication & Role Validation
  IF v_caller_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_user_role FROM profiles WHERE id = v_caller_id;
    IF v_user_role IS NOT NULL AND v_user_role NOT IN ('owner', 'production_worker') THEN
      RAISE EXCEPTION 'Access denied. Production entry requires production_worker or owner role.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Idempotency Check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_batch 
    FROM production_batches 
    WHERE idempotency_key = p_idempotency_key 
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'batch_id', v_existing_batch.id,
        'batch_number', v_existing_batch.batch_number,
        'message', 'Production batch already completed (Idempotent replay)'
      );
    END IF;
  END IF;

  -- 3. Quantity Validations
  IF p_produced_quantity IS NULL OR p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than 0' USING ERRCODE = '22023';
  END IF;

  IF p_damaged_quantity IS NULL OR p_damaged_quantity < 0 THEN
    RAISE EXCEPTION 'Damaged quantity cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_damaged_quantity > p_produced_quantity THEN
    RAISE EXCEPTION 'खराब मात्रा (% पीस) उत्पादित मात्रा (% पीस) से अधिक नहीं हो सकती',
      p_damaged_quantity, p_produced_quantity
      USING ERRCODE = '22023';
  END IF;

  v_saleable_qty := p_produced_quantity - p_damaged_quantity;

  -- 4. Lock & Validate Product
  SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % does not exist', p_product_id USING ERRCODE = 'P0002';
  END IF;

  -- 5. Lock & Load Active Recipe
  IF p_recipe_id IS NOT NULL THEN
    SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id FOR UPDATE;
  ELSE
    SELECT * INTO v_recipe FROM recipes 
    WHERE product_id = p_product_id AND status = 'active' 
    ORDER BY version_number DESC LIMIT 1 FOR UPDATE;
  END IF;

  IF NOT FOUND OR v_recipe.id IS NULL THEN
    RAISE EXCEPTION 'No active recipe configured for product "%" (%)',
      v_product.name_hi, v_product.name_en
      USING ERRCODE = 'P0002';
  END IF;

  v_expected_yield := COALESCE(v_recipe.expected_yield_pieces, v_recipe.standard_output_pieces, 100);
  IF v_expected_yield <= 0 THEN
    RAISE EXCEPTION 'Recipe yield must be greater than 0' USING ERRCODE = '22023';
  END IF;

  -- Verify recipe has items
  IF NOT EXISTS (SELECT 1 FROM recipe_items WHERE recipe_id = v_recipe.id) THEN
    RAISE EXCEPTION 'Active recipe has no ingredient items configured' USING ERRCODE = '22023';
  END IF;

  -- 6. Lock Inventory Rows & Pre-validate Stock Availability
  FOR v_rec_item IN 
    SELECT ri.*, i.name_en, i.name_hi, i.base_unit, i.conversion_factor, i.current_rate, i.rate_unit, i.category, i.storage_location
    FROM recipe_items ri
    JOIN ingredients i ON ri.ingredient_id = i.id
    WHERE ri.recipe_id = v_recipe.id
    ORDER BY ri.sort_order, ri.id
  LOOP
    -- Lock ingredient master
    PERFORM 1 FROM ingredients WHERE id = v_rec_item.ingredient_id FOR UPDATE;

    -- Standard required recipe consumption: (recipe_quantity / yield) * produced_quantity
    v_std_item_qty := (v_rec_item.quantity / v_expected_yield) * p_produced_quantity;
    v_req_item_qty := v_std_item_qty;
    v_actual_item_qty := v_std_item_qty;
    v_variance_reason := NULL;

    -- Check if actual override was provided for this ingredient
    IF p_actual_ingredients IS NOT NULL AND jsonb_array_length(p_actual_ingredients) > 0 THEN
      FOR v_actual_override_entry IN SELECT * FROM jsonb_array_elements(p_actual_ingredients) LOOP
        IF (v_actual_override_entry->>'ingredient_id')::UUID = v_rec_item.ingredient_id THEN
          v_actual_item_qty := COALESCE((v_actual_override_entry->>'actual_quantity')::NUMERIC, v_std_item_qty);
          v_variance_reason := v_actual_override_entry->>'reason';
          
          IF v_actual_item_qty <> v_std_item_qty THEN
            v_has_actual_override := true;
            IF v_variance_reason IS NULL OR length(btrim(v_variance_reason)) < 3 THEN
              RAISE EXCEPTION 'A valid reason is mandatory when actual consumption of "%" differs from recipe standard.',
                v_rec_item.name_hi USING ERRCODE = '22023';
            END IF;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Convert to base unit for ledger check
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

    -- Calculate current authoritative available stock
    SELECT GREATEST(0, COALESCE(SUM(quantity), 0)) INTO v_avail_stock
    FROM raw_material_movements
    WHERE ingredient_id = v_rec_item.ingredient_id;

    IF v_avail_stock < v_item_base_qty THEN
      v_shortage := v_item_base_qty - v_avail_stock;
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

    -- Calculate Cost using rate snapshot and unit conversion to rate_unit
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

    -- Buffer calculated data for insertion
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

  -- 7. Reject completion if any shortages exist
  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'Insufficient raw material stock for production. Shortages: %', v_shortages
      USING ERRCODE = '22023';
  END IF;

  IF v_has_actual_override THEN
    v_costing_source := 'actual_override';
  END IF;

  -- 8. Final Cost Breakdown
  v_total_batch_cost := v_total_ingredient_cost + COALESCE(p_lpg_cost, 0.00);
  IF p_produced_quantity > 0 THEN
    v_cost_per_piece := ROUND(v_total_batch_cost / p_produced_quantity, 2);
  END IF;

  -- 9. Create Production Batch
  v_batch_number := 'BAT-' || TO_CHAR(p_production_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

  INSERT INTO production_batches (
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
    p_production_date,
    'completed',
    v_total_ingredient_cost,
    v_recipe.id,
    COALESCE(p_overhead_costs, '{}'::jsonb),
    v_total_batch_cost,
    v_cost_per_piece,
    v_costing_source,
    p_idempotency_key,
    v_expected_yield::INTEGER,
    v_recipe.version_number,
    COALESCE(p_lpg_cost, 0.00),
    p_notes,
    NOW(),
    v_caller_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_batch_id;

  -- 10. Insert Production Item
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
    p_product_id,
    p_produced_quantity,
    p_damaged_quantity,
    v_saleable_qty,
    v_total_ingredient_cost,
    v_cost_per_piece,
    p_notes
  );

  -- 11. Insert Batch Ingredient Snapshots & Raw Material Consumption Movements
  FOR v_actual_override_entry IN SELECT * FROM jsonb_array_elements(v_calculated_ingredients) LOOP
    -- Permanent Snapshot
    INSERT INTO production_batch_ingredients (
      batch_id,
      ingredient_id,
      ingredient_name,
      quantity_used,
      unit,
      converted_base_quantity,
      rate_snapshot,
      rate_unit,
      calculated_cost,
      is_packaging,
      expected_quantity,
      actual_quantity,
      variance_reason
    ) VALUES (
      v_batch_id,
      (v_actual_override_entry->>'ingredient_id')::UUID,
      v_actual_override_entry->>'ingredient_name',
      (v_actual_override_entry->>'actual_qty')::NUMERIC,
      v_actual_override_entry->>'unit',
      (v_actual_override_entry->>'base_qty')::NUMERIC,
      (v_actual_override_entry->>'rate_snapshot')::NUMERIC,
      v_actual_override_entry->>'rate_unit',
      (v_actual_override_entry->>'calculated_cost')::NUMERIC,
      (v_actual_override_entry->>'is_packaging')::BOOLEAN,
      (v_actual_override_entry->>'expected_qty')::NUMERIC,
      (v_actual_override_entry->>'actual_qty')::NUMERIC,
      v_actual_override_entry->>'variance_reason'
    );

    -- Authoritative Negative Raw Material Movement (Deduction)
    INSERT INTO raw_material_movements (
      ingredient_id,
      movement_date,
      source_location,
      destination_location,
      quantity,
      base_unit,
      movement_type,
      reference_table,
      reference_id,
      unit_cost_snapshot,
      total_value_snapshot,
      reason,
      created_by
    ) VALUES (
      (v_actual_override_entry->>'ingredient_id')::UUID,
      NOW(),
      v_actual_override_entry->>'storage_location',
      'Production Floor',
      -((v_actual_override_entry->>'base_qty')::NUMERIC), -- Deduct
      v_actual_override_entry->>'rate_unit',
      'production_consumption',
      'production_batches',
      v_batch_id,
      (v_actual_override_entry->>'rate_snapshot')::NUMERIC,
      (v_actual_override_entry->>'calculated_cost')::NUMERIC,
      'Batch ' || v_batch_number || ' (' || v_product.name_hi || ' ' || p_produced_quantity || ' pcs)',
      v_caller_id
    );
  END LOOP;

  -- 12. Increase Finished Kulfi Stock in Main Freezer
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');

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
      p_product_id,
      v_prod_loc_id,
      v_freezer_loc_id,
      v_saleable_qty,
      'production_completed',
      'production_batches',
      v_batch_id,
      'Recipe Batch Completed: ' || v_batch_number || ' (' || v_product.name_hi || ')',
      v_caller_id
    );
  END IF;

  -- 13. Audit Log
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_data,
    reason,
    performed_by,
    performed_at
  ) VALUES (
    'production_batches',
    v_batch_id,
    'COMPLETE_RECIPE_PRODUCTION',
    jsonb_build_object(
      'batch_number', v_batch_number,
      'product_id', p_product_id,
      'product_name', v_product.name_hi,
      'produced_qty', p_produced_quantity,
      'damaged_qty', p_damaged_quantity,
      'saleable_qty', v_saleable_qty,
      'recipe_id', v_recipe.id,
      'recipe_version', v_recipe.version_number,
      'total_ingredient_cost', v_total_ingredient_cost,
      'lpg_cost', p_lpg_cost,
      'total_batch_cost', v_total_batch_cost,
      'cost_per_piece', v_cost_per_piece,
      'costing_source', v_costing_source
    ),
    'Production completed atomically with recipe ingredient deduction',
    v_caller_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'saleable_quantity', v_saleable_qty,
    'total_ingredient_cost', v_total_ingredient_cost,
    'cost_per_piece', v_cost_per_piece,
    'message', 'उत्पादन बैच सफलतापूर्वक दर्ज हुआ, कच्चा माल घटाया गया एवं स्टॉक मुख्य फ्रीजर में स्थानांतरित हुआ'
  );
END;
$$;

REVOKE ALL ON FUNCTION complete_production_with_recipe_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_production_with_recipe_transaction TO authenticated;


-- 7. RPC: Activate Recipe Version Transaction
CREATE OR REPLACE FUNCTION activate_recipe_version_transaction(
  p_recipe_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(p_user_id, auth.uid());
  v_user_role TEXT;
  v_recipe RECORD;
  v_yield INTEGER;
  v_items_count INTEGER;
BEGIN
  IF v_caller_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_user_role FROM profiles WHERE id = v_caller_id;
    IF v_user_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only the Owner can activate recipe versions' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe % not found', p_recipe_id USING ERRCODE = 'P0002';
  END IF;

  v_yield := COALESCE(v_recipe.expected_yield_pieces, v_recipe.standard_output_pieces, 0);
  IF v_yield <= 0 THEN
    RAISE EXCEPTION 'Cannot activate recipe with 0 expected yield' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_items_count FROM recipe_items WHERE recipe_id = p_recipe_id;
  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'Cannot activate recipe with no ingredient items' USING ERRCODE = '22023';
  END IF;

  -- Archive currently active recipe for this product
  UPDATE recipes
  SET status = 'archived',
      is_default = false,
      updated_at = NOW()
  WHERE product_id = v_recipe.product_id AND status = 'active';

  -- Activate selected recipe
  UPDATE recipes
  SET status = 'active',
      is_default = true,
      updated_at = NOW()
  WHERE id = p_recipe_id;

  INSERT INTO audit_logs (
    table_name, record_id, action, new_data, reason, performed_by, performed_at
  ) VALUES (
    'recipes', p_recipe_id, 'ACTIVATE_RECIPE_VERSION',
    jsonb_build_object('product_id', v_recipe.product_id, 'version_number', v_recipe.version_number, 'name', v_recipe.name),
    'Activated recipe version and archived previous version',
    v_caller_id, NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'recipe_id', p_recipe_id,
    'product_id', v_recipe.product_id,
    'version_number', v_recipe.version_number,
    'message', 'रेसिपी संस्करण सफलतापूर्वक सक्रिय (Active) किया गया'
  );
END;
$$;

REVOKE ALL ON FUNCTION activate_recipe_version_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION activate_recipe_version_transaction TO authenticated;


-- 8. RPC: Safe Delete Recipe Version Transaction
CREATE OR REPLACE FUNCTION delete_recipe_version_transaction(
  p_recipe_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(p_user_id, auth.uid());
  v_user_role TEXT;
  v_recipe RECORD;
  v_batch_count INTEGER;
BEGIN
  IF v_caller_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_user_role FROM profiles WHERE id = v_caller_id;
    IF v_user_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only the Owner can delete recipe versions' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe % not found', p_recipe_id USING ERRCODE = 'P0002';
  END IF;

  -- 1. Check if referenced in production batches
  SELECT COUNT(*) INTO v_batch_count FROM production_batches WHERE recipe_id = p_recipe_id;
  IF v_batch_count > 0 THEN
    -- Used in production: Cannot permanently delete. Archive instead.
    UPDATE recipes 
    SET status = 'archived', is_default = false, updated_at = NOW() 
    WHERE id = p_recipe_id;

    INSERT INTO audit_logs (
      table_name, record_id, action, new_data, reason, performed_by, performed_at
    ) VALUES (
      'recipes', p_recipe_id, 'ARCHIVE_USED_RECIPE',
      jsonb_build_object('product_id', v_recipe.product_id, 'version_number', v_recipe.version_number, 'batches_count', v_batch_count),
      'Recipe referenced by production batches cannot be deleted and was archived',
      v_caller_id, NOW()
    );

    RETURN jsonb_build_object(
      'success', false,
      'archived', true,
      'message', 'यह रेसिपी उत्पादन इतिहास में प्रयुक्त है, इसलिए इसे हटाया नहीं जा सकता। इसे संग्रहीत (Archived) कर दिया गया है।'
    );
  END IF;

  -- 2. Check if active
  IF v_recipe.status = 'active' THEN
    RAISE EXCEPTION 'सक्रिय रेसिपी (Active Recipe) को सीधे हटाया नहीं जा सकता। कृपया पहले अन्य संस्करण सक्रिय करें अथवा इसे संग्रहीत करें।'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Permanent delete unused draft/archived recipe
  DELETE FROM recipe_items WHERE recipe_id = p_recipe_id;
  DELETE FROM recipes WHERE id = p_recipe_id;

  INSERT INTO audit_logs (
    table_name, record_id, action, old_data, reason, performed_by, performed_at
  ) VALUES (
    'recipes', p_recipe_id, 'DELETE_UNUSED_RECIPE',
    jsonb_build_object('product_id', v_recipe.product_id, 'version_number', v_recipe.version_number, 'name', v_recipe.name),
    'Permanently deleted unused draft/archived recipe version',
    v_caller_id, NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted', true,
    'message', 'रेसिपी संस्करण सफलतापूर्वक स्थायी रूप से हटाया गया'
  );
END;
$$;

REVOKE ALL ON FUNCTION delete_recipe_version_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_recipe_version_transaction TO authenticated;


-- 9. RPC: Physical Stock Correction for Raw Material
CREATE OR REPLACE FUNCTION correct_raw_material_stock_transaction(
  p_ingredient_id UUID,
  p_new_quantity NUMERIC(12,3),
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(p_user_id, auth.uid());
  v_user_role TEXT;
  v_ing RECORD;
  v_current_stock NUMERIC(12,3);
  v_target_stock NUMERIC(12,3);
  v_diff NUMERIC(12,3);
  v_unit_rate NUMERIC(12,4);
  v_diff_value NUMERIC(12,2);
  v_movement_id UUID;
BEGIN
  IF v_caller_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_user_role FROM profiles WHERE id = v_caller_id;
    IF v_user_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only the Owner can correct raw material physical stock' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A correction reason is mandatory' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ing FROM ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient % not found', p_ingredient_id USING ERRCODE = 'P0002';
  END IF;

  SELECT GREATEST(0, COALESCE(SUM(quantity), 0)) INTO v_current_stock
  FROM raw_material_movements
  WHERE ingredient_id = p_ingredient_id;

  v_target_stock := GREATEST(0, COALESCE(p_new_quantity, 0));
  v_diff := v_target_stock - v_current_stock;
  v_unit_rate := COALESCE(v_ing.current_rate, 0.00);
  v_diff_value := ROUND(ABS(v_diff) * v_unit_rate, 2);

  IF v_diff <> 0 THEN
    INSERT INTO raw_material_movements (
      ingredient_id,
      movement_date,
      source_location,
      destination_location,
      quantity,
      base_unit,
      movement_type,
      unit_cost_snapshot,
      total_value_snapshot,
      reason,
      created_by
    ) VALUES (
      p_ingredient_id,
      NOW(),
      CASE WHEN v_diff < 0 THEN COALESCE(v_ing.storage_location, 'Main Store') ELSE 'Physical Stock Count' END,
      CASE WHEN v_diff < 0 THEN 'Physical Stock Loss' ELSE COALESCE(v_ing.storage_location, 'Main Store') END,
      v_diff,
      v_ing.base_unit,
      'physical_count_correction',
      v_unit_rate,
      v_diff_value,
      'Physical stock correction: ' || v_current_stock || ' -> ' || v_target_stock || ' ' || v_ing.base_unit || '. Reason: ' || btrim(p_reason),
      v_caller_id
    ) RETURNING id INTO v_movement_id;

    INSERT INTO audit_logs (
      table_name, record_id, action, old_data, new_data, reason, performed_by, performed_at
    ) VALUES (
      'raw_material_movements', v_movement_id, 'PHYSICAL_STOCK_CORRECTION',
      jsonb_build_object('ingredient_id', p_ingredient_id, 'previous_quantity', v_current_stock),
      jsonb_build_object('ingredient_id', p_ingredient_id, 'new_quantity', v_target_stock, 'difference', v_diff),
      btrim(p_reason), v_caller_id, NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ingredient_id', p_ingredient_id,
    'previous_quantity', v_current_stock,
    'new_quantity', v_target_stock,
    'difference', v_diff,
    'unit', v_ing.base_unit,
    'message', 'भौतिक स्टॉक संशोधन सफलतापूर्वक दर्ज हुआ'
  );
END;
$$;

REVOKE ALL ON FUNCTION correct_raw_material_stock_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION correct_raw_material_stock_transaction TO authenticated;


-- 10. RPC: Safe Delete / Deactivate Raw Material Ingredient
CREATE OR REPLACE FUNCTION delete_ingredient_transaction(
  p_ingredient_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := COALESCE(p_user_id, auth.uid());
  v_user_role TEXT;
  v_ing RECORD;
  v_usage_count INTEGER := 0;
BEGIN
  IF v_caller_id IS NOT NULL THEN
    SELECT role::TEXT INTO v_user_role FROM profiles WHERE id = v_caller_id;
    IF v_user_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Only the Owner can delete or deactivate ingredients' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_ing FROM ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient % not found', p_ingredient_id USING ERRCODE = 'P0002';
  END IF;

  -- Check recipe usage
  SELECT COUNT(*) INTO v_usage_count FROM recipe_items WHERE ingredient_id = p_ingredient_id;
  IF v_usage_count > 0 THEN
    UPDATE ingredients SET is_active = false, updated_at = NOW() WHERE id = p_ingredient_id;
    RETURN jsonb_build_object(
      'success', false,
      'deactivated', true,
      'message', 'सामग्री रेसिपी में प्रयुक्त है और स्थायी रूप से नहीं हटाई जा सकती। इसे निष्क्रिय (Inactive) कर दिया गया है।'
    );
  END IF;

  -- Check purchase history
  SELECT COUNT(*) INTO v_usage_count FROM material_purchase_items WHERE ingredient_id = p_ingredient_id;
  IF v_usage_count > 0 THEN
    UPDATE ingredients SET is_active = false, updated_at = NOW() WHERE id = p_ingredient_id;
    RETURN jsonb_build_object(
      'success', false,
      'deactivated', true,
      'message', 'सामग्री का खरीद इतिहास है और स्थायी रूप से नहीं हटाई जा सकती। इसे निष्क्रिय (Inactive) कर दिया गया है।'
    );
  END IF;

  -- Check ledger movements
  SELECT COUNT(*) INTO v_usage_count FROM raw_material_movements WHERE ingredient_id = p_ingredient_id;
  IF v_usage_count > 0 THEN
    UPDATE ingredients SET is_active = false, updated_at = NOW() WHERE id = p_ingredient_id;
    RETURN jsonb_build_object(
      'success', false,
      'deactivated', true,
      'message', 'सामग्री का स्टॉक बहीखाता इतिहास है। इसे निष्क्रिय (Inactive) कर दिया गया है।'
    );
  END IF;

  -- Safe to permanently delete
  DELETE FROM ingredient_prices WHERE ingredient_id = p_ingredient_id;
  DELETE FROM ingredients WHERE id = p_ingredient_id;

  INSERT INTO audit_logs (
    table_name, record_id, action, old_data, reason, performed_by, performed_at
  ) VALUES (
    'ingredients', p_ingredient_id, 'DELETE_UNUSED_INGREDIENT',
    jsonb_build_object('code', v_ing.code, 'name_hi', v_ing.name_hi, 'name_en', v_ing.name_en),
    COALESCE(p_reason, 'Permanently deleted unused raw material'),
    v_caller_id, NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted', true,
    'message', 'सामग्री स्थायी रूप से हटा दी गई'
  );
END;
$$;

REVOKE ALL ON FUNCTION delete_ingredient_transaction FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_ingredient_transaction TO authenticated;

NOTIFY pgrst, 'reload schema';
