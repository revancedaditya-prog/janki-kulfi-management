-- ============================================================================
-- Migration 038: Fix Recipe Calculator & Product Editing Workflow
-- Adds atomic save_recipe_version_transaction & update_product_transaction RPCs,
-- ensures price history tracking, and guarantees safe versioning.
-- ============================================================================

-- 1. Ensure Recipes & Recipe Items schema compatibility
ALTER TABLE IF EXISTS public.recipes
  ADD COLUMN IF NOT EXISTS expected_yield_pieces INTEGER NOT NULL DEFAULT 100 CHECK (expected_yield_pieces > 0),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_overheads JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipes_status_check'
  ) THEN
    ALTER TABLE public.recipes
      ADD CONSTRAINT recipes_status_check CHECK (status IN ('draft', 'active', 'archived'));
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS public.recipe_items
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,3) NOT NULL DEFAULT 0.000 CHECK (quantity >= 0),
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS is_optional BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_recipes_product_status ON public.recipes(product_id, status);
CREATE INDEX IF NOT EXISTS idx_recipes_product_default ON public.recipes(product_id, is_default);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_id ON public.recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient_id ON public.recipe_items(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_product_effective ON public.product_prices(product_id, effective_from, effective_to);

-- 2. Drop existing overloaded signatures of recipe and product RPCs to ensure clean state
DROP FUNCTION IF EXISTS public.save_recipe_version_transaction(UUID, UUID, TEXT, INTEGER, JSONB, JSONB, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.save_recipe_version_transaction(UUID, TEXT, INTEGER, JSONB, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_product_transaction(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, BOOLEAN);
DROP FUNCTION IF EXISTS public.activate_recipe_version_transaction(UUID, UUID);
DROP FUNCTION IF EXISTS public.activate_recipe_version_transaction(UUID, TEXT);
DROP FUNCTION IF EXISTS public.activate_recipe_version_transaction(UUID);
DROP FUNCTION IF EXISTS public.delete_recipe_version_transaction(UUID, UUID);
DROP FUNCTION IF EXISTS public.delete_recipe_version_transaction(UUID, TEXT);
DROP FUNCTION IF EXISTS public.delete_recipe_version_transaction(UUID);

-- 3. Atomic Recipe Save RPC Function
CREATE OR REPLACE FUNCTION public.save_recipe_version_transaction(
  p_product_id UUID,
  p_recipe_id UUID DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_expected_yield INTEGER DEFAULT 100,
  p_default_overheads JSONB DEFAULT '{}'::JSONB,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_status TEXT DEFAULT 'active',
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_role TEXT;
  v_product RECORD;
  v_target_recipe_id UUID;
  v_target_version INTEGER;
  v_is_edit_in_place BOOLEAN := FALSE;
  v_batch_count INTEGER := 0;
  v_existing_recipe RECORD;
  v_item JSONB;
  v_ing RECORD;
  v_ing_id UUID;
  v_qty NUMERIC(12,3);
  v_unit TEXT;
  v_rate NUMERIC(12,2);
  v_eff_rate_unit TEXT;
  v_calculated_cost NUMERIC(12,2);
  v_total_ingredient_cost NUMERIC(12,2) := 0.00;
  v_cost_per_piece NUMERIC(12,2) := 0.00;
  v_saved_items JSONB := '[]'::JSONB;
  v_sort_order INTEGER := 1;
BEGIN
  -- 1. Authorization check: Require authenticated Owner
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null (प्रमाणीकरण आवश्यक है)' USING ERRCODE = '42501';
  END IF;

  SELECT role::TEXT INTO v_user_role 
  FROM public.profiles 
  WHERE id = v_caller_id AND is_active = true;

  IF v_user_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Unauthorized: Only Owner can create or edit recipes (केवल स्वामी ही रेसिपी बना या बदल सकते हैं)' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate product exists
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found (उत्पाद नहीं मिला)', p_product_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Validate expected yield
  IF COALESCE(p_expected_yield, 0) <= 0 THEN
    RAISE EXCEPTION 'Expected yield must be greater than zero (मानक उत्पादन उपज 0 से अधिक होनी चाहिए)' USING ERRCODE = '22023';
  END IF;

  -- 4. Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Recipe must contain at least one ingredient (रेसिपी में कम से कम एक सामग्री आवश्यक है)' USING ERRCODE = '22023';
  END IF;

  -- 5. Determine whether to edit in-place or create new version
  IF p_recipe_id IS NOT NULL THEN
    SELECT * INTO v_existing_recipe 
    FROM public.recipes 
    WHERE id = p_recipe_id AND product_id = p_product_id 
    FOR UPDATE;

    IF FOUND THEN
      -- Check if referenced in production_batches
      SELECT COUNT(*) INTO v_batch_count 
      FROM public.production_batches 
      WHERE recipe_id = p_recipe_id;

      IF v_batch_count = 0 AND v_existing_recipe.status = 'draft' THEN
        -- Unused draft recipe: Can be edited in place
        v_is_edit_in_place := TRUE;
        v_target_recipe_id := p_recipe_id;
        v_target_version := v_existing_recipe.version_number;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_edit_in_place THEN
    -- Used or active historical recipe (or new recipe): Create a new version
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_target_version
    FROM public.recipes
    WHERE product_id = p_product_id;

    v_target_recipe_id := gen_random_uuid();

    -- If activating new version, archive previous active versions for this product
    IF COALESCE(p_status, 'active') = 'active' THEN
      UPDATE public.recipes
      SET status = 'archived',
          is_default = false,
          updated_at = NOW()
      WHERE product_id = p_product_id AND (status = 'active' OR is_default = true);
    END IF;

    INSERT INTO public.recipes (
      id,
      product_id,
      version_number,
      name,
      standard_output_pieces,
      expected_yield_pieces,
      default_overheads,
      notes,
      status,
      is_default,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_target_recipe_id,
      p_product_id,
      v_target_version,
      COALESCE(NULLIF(TRIM(p_name), ''), v_product.name_hi || ' Standard Recipe v' || v_target_version),
      p_expected_yield,
      p_expected_yield,
      COALESCE(p_default_overheads, '{}'::JSONB),
      NULLIF(TRIM(p_notes), ''),
      COALESCE(p_status, 'active'),
      (COALESCE(p_status, 'active') = 'active'),
      v_caller_id,
      NOW(),
      NOW()
    );
  ELSE
    -- Edit in-place for unused draft
    IF COALESCE(p_status, 'draft') = 'active' THEN
      UPDATE public.recipes
      SET status = 'archived',
          is_default = false,
          updated_at = NOW()
      WHERE product_id = p_product_id AND id <> v_target_recipe_id AND (status = 'active' OR is_default = true);
    END IF;

    UPDATE public.recipes
    SET name = COALESCE(NULLIF(TRIM(p_name), ''), name),
        standard_output_pieces = p_expected_yield,
        expected_yield_pieces = p_expected_yield,
        default_overheads = COALESCE(p_default_overheads, '{}'::JSONB),
        notes = NULLIF(TRIM(p_notes), ''),
        status = COALESCE(p_status, status),
        is_default = (COALESCE(p_status, status) = 'active'),
        updated_at = NOW()
    WHERE id = v_target_recipe_id;

    -- Delete old items of the draft in-place
    DELETE FROM public.recipe_items WHERE recipe_id = v_target_recipe_id;
  END IF;

  -- 6. Validate and Insert all recipe items
  v_sort_order := 1;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'ingredient_id') IS NULL OR NOT ((v_item->>'ingredient_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'Invalid ingredient ID format: %', (v_item->>'ingredient_id') USING ERRCODE = '22023';
    END IF;
    v_ing_id := (v_item->>'ingredient_id')::UUID;

    SELECT * INTO v_ing FROM public.ingredients WHERE id = v_ing_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ingredient % not found (सामग्री नहीं मिली)', v_ing_id USING ERRCODE = 'P0002';
    END IF;

    IF v_ing.is_active IS FALSE THEN
      RAISE EXCEPTION 'Ingredient % (%) is inactive (सामग्री निष्क्रिय है)', v_ing.name_hi, v_ing_id USING ERRCODE = '22023';
    END IF;

    v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0.000);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity for % must be greater than zero (मात्रा 0 से अधिक होनी चाहिए)', v_ing.name_hi USING ERRCODE = '22023';
    END IF;

    v_unit := COALESCE(NULLIF(TRIM(v_item->>'unit'), ''), v_ing.base_unit, 'kg');

    INSERT INTO public.recipe_items (
      id,
      recipe_id,
      ingredient_id,
      quantity,
      unit,
      is_optional,
      sort_order,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_target_recipe_id,
      v_ing_id,
      v_qty,
      v_unit,
      COALESCE((v_item->>'is_optional')::BOOLEAN, false),
      v_sort_order,
      NOW()
    );

    v_rate := COALESCE(v_ing.current_rate, 0.00);
    v_eff_rate_unit := COALESCE(v_ing.rate_unit, v_ing.base_unit, 'kg');

    IF (v_unit = 'g' AND v_eff_rate_unit = 'kg') OR (v_unit = 'ml' AND v_eff_rate_unit = 'litre') THEN
      v_calculated_cost := ROUND((v_qty / 1000.0) * v_rate, 2);
    ELSIF (v_unit = 'kg' AND v_eff_rate_unit = 'g') OR (v_unit = 'litre' AND v_eff_rate_unit = 'ml') THEN
      v_calculated_cost := ROUND((v_qty * 1000.0) * v_rate, 2);
    ELSE
      v_calculated_cost := ROUND(v_qty * v_rate, 2);
    END IF;

    v_total_ingredient_cost := v_total_ingredient_cost + v_calculated_cost;

    v_saved_items := v_saved_items || jsonb_build_array(
      jsonb_build_object(
        'ingredient_id', v_ing_id,
        'ingredient_name_hi', v_ing.name_hi,
        'ingredient_name_en', v_ing.name_en,
        'quantity', v_qty,
        'unit', v_unit,
        'rate', v_rate,
        'rate_unit', v_eff_rate_unit,
        'calculated_cost', v_calculated_cost
      )
    );

    v_sort_order := v_sort_order + 1;
  END LOOP;

  v_cost_per_piece := ROUND(v_total_ingredient_cost / p_expected_yield, 2);

  -- 7. Audit log
  INSERT INTO public.audit_logs (
    table_name, record_id, action, new_data, reason, performed_by, performed_at
  ) VALUES (
    'recipes',
    v_target_recipe_id,
    CASE WHEN v_is_edit_in_place THEN 'UPDATE_DRAFT_RECIPE' ELSE 'CREATE_RECIPE_VERSION' END,
    jsonb_build_object(
      'product_id', p_product_id,
      'recipe_id', v_target_recipe_id,
      'version_number', v_target_version,
      'expected_yield', p_expected_yield,
      'item_count', jsonb_array_length(p_items),
      'total_ingredient_cost', v_total_ingredient_cost,
      'cost_per_piece', v_cost_per_piece,
      'status', COALESCE(p_status, 'active')
    ),
    'Saved recipe v' || v_target_version || ' (' || COALESCE(p_status, 'active') || ')',
    v_caller_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'recipe_id', v_target_recipe_id,
    'product_id', p_product_id,
    'version_number', v_target_version,
    'status', COALESCE(p_status, 'active'),
    'is_default', (COALESCE(p_status, 'active') = 'active'),
    'expected_yield_pieces', p_expected_yield,
    'standard_output_pieces', p_expected_yield,
    'items', v_saved_items,
    'total_ingredient_cost', v_total_ingredient_cost,
    'cost_per_piece', v_cost_per_piece,
    'message', 'रेसिपी संस्करण v' || v_target_version || ' सफलतापूर्वक सुरक्षित किया गया'
  );
END;
$$;

-- 4. Atomic Product Update & Price History RPC Function
CREATE OR REPLACE FUNCTION public.update_product_transaction(
  p_product_id UUID,
  p_name_en TEXT,
  p_name_hi TEXT,
  p_sku TEXT,
  p_description TEXT DEFAULT NULL,
  p_selling_price NUMERIC DEFAULT NULL,
  p_commission_type TEXT DEFAULT 'fixed',
  p_commission_value NUMERIC DEFAULT 0.00,
  p_is_active BOOLEAN DEFAULT TRUE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_role TEXT;
  v_old_prod RECORD;
  v_current_price RECORD;
  v_price_changed BOOLEAN := FALSE;
  v_comm_changed BOOLEAN := FALSE;
  v_new_price_id UUID := NULL;
BEGIN
  -- 1. Authorization check: Require active Owner
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null (प्रमाणीकरण आवश्यक है)' USING ERRCODE = '42501';
  END IF;

  SELECT role::TEXT INTO v_user_role 
  FROM public.profiles 
  WHERE id = v_caller_id AND is_active = true;

  IF v_user_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Unauthorized: Only Owner can edit products (केवल स्वामी ही उत्पाद विवरण बदल सकते हैं)' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock product
  SELECT * INTO v_old_prod FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % not found (उत्पाद नहीं मिला)', p_product_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Check SKU uniqueness
  IF p_sku IS NOT NULL AND TRIM(p_sku) <> '' THEN
    IF EXISTS (
      SELECT 1 FROM public.products 
      WHERE UPPER(sku) = UPPER(TRIM(p_sku)) AND id <> p_product_id
    ) THEN
      RAISE EXCEPTION 'SKU/Code "%" is already used by another product (यह SKU कोड किसी अन्य उत्पाद में प्रयुक्त है)', TRIM(p_sku) USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 4. Update products table
  UPDATE public.products
  SET name_en = COALESCE(NULLIF(TRIM(p_name_en), ''), name_en),
      name_hi = COALESCE(NULLIF(TRIM(p_name_hi), ''), name_hi),
      sku = COALESCE(NULLIF(TRIM(p_sku), ''), sku),
      description = NULLIF(TRIM(p_description), ''),
      is_active = COALESCE(p_is_active, is_active),
      updated_at = NOW()
  WHERE id = p_product_id;

  -- 5. Handle Price History
  IF p_selling_price IS NOT NULL AND p_selling_price >= 0 THEN
    SELECT * INTO v_current_price 
    FROM public.product_prices 
    WHERE product_id = p_product_id AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY effective_from DESC 
    LIMIT 1;

    IF FOUND THEN
      IF v_current_price.selling_price <> p_selling_price THEN
        v_price_changed := TRUE;
      END IF;
      IF v_current_price.commission_type::TEXT <> p_commission_type OR v_current_price.commission_value <> p_commission_value THEN
        v_comm_changed := TRUE;
      END IF;
    ELSE
      v_price_changed := TRUE;
    END IF;

    IF v_price_changed OR v_comm_changed THEN
      -- Close old active price
      UPDATE public.product_prices
      SET effective_to = NOW()
      WHERE product_id = p_product_id AND (effective_to IS NULL OR effective_to > NOW());

      -- Insert new active price record
      INSERT INTO public.product_prices (
        id,
        product_id,
        selling_price,
        commission_type,
        commission_value,
        effective_from,
        created_by,
        created_at
      ) VALUES (
        gen_random_uuid(),
        p_product_id,
        p_selling_price,
        p_commission_type::commission_type,
        COALESCE(p_commission_value, 0.00),
        NOW(),
        v_caller_id,
        NOW()
      ) RETURNING id INTO v_new_price_id;
    END IF;
  END IF;

  -- 6. Audit Log
  INSERT INTO public.audit_logs (
    table_name, record_id, action, old_data, new_data, reason, performed_by, performed_at
  ) VALUES (
    'products',
    p_product_id,
    'UPDATE_PRODUCT',
    row_to_json(v_old_prod)::JSONB,
    jsonb_build_object(
      'name_en', p_name_en,
      'name_hi', p_name_hi,
      'sku', p_sku,
      'is_active', p_is_active,
      'selling_price', p_selling_price,
      'price_changed', v_price_changed
    ),
    'Updated product master and price history',
    v_caller_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'selling_price', p_selling_price,
    'price_updated', (v_price_changed OR v_comm_changed),
    'message', 'उत्पाद विवरण एवं मूल्य सफलतापूर्वक अपडेट किया गया'
  );
END;
$$;

-- 5. Safe Recipe Version Activation RPC
CREATE OR REPLACE FUNCTION public.activate_recipe_version_transaction(
  p_recipe_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_role TEXT;
  v_recipe RECORD;
  v_yield INTEGER;
  v_items_count INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null' USING ERRCODE = '42501';
  END IF;

  SELECT role::TEXT INTO v_user_role FROM public.profiles WHERE id = v_caller_id AND is_active = true;
  IF v_user_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the Owner can activate recipe versions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_recipe FROM public.recipes WHERE id = p_recipe_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe % not found', p_recipe_id USING ERRCODE = 'P0002';
  END IF;

  v_yield := COALESCE(v_recipe.expected_yield_pieces, v_recipe.standard_output_pieces, 0);
  IF v_yield <= 0 THEN
    RAISE EXCEPTION 'Cannot activate recipe with 0 expected yield' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_items_count FROM public.recipe_items WHERE recipe_id = p_recipe_id;
  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'Cannot activate recipe with no ingredient items' USING ERRCODE = '22023';
  END IF;

  -- Archive currently active recipe for this product
  UPDATE public.recipes
  SET status = 'archived',
      is_default = false,
      updated_at = NOW()
  WHERE product_id = v_recipe.product_id AND status = 'active';

  -- Activate selected recipe
  UPDATE public.recipes
  SET status = 'active',
      is_default = true,
      updated_at = NOW()
  WHERE id = p_recipe_id;

  INSERT INTO public.audit_logs (
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

-- 6. Safe Recipe Version Delete / Archive RPC
CREATE OR REPLACE FUNCTION public.delete_recipe_version_transaction(
  p_recipe_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_user_role TEXT;
  v_recipe RECORD;
  v_batch_count INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null' USING ERRCODE = '42501';
  END IF;

  SELECT role::TEXT INTO v_user_role FROM public.profiles WHERE id = v_caller_id AND is_active = true;
  IF v_user_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the Owner can delete recipe versions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_recipe FROM public.recipes WHERE id = p_recipe_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe % not found', p_recipe_id USING ERRCODE = 'P0002';
  END IF;

  -- 1. Check if referenced in production batches
  SELECT COUNT(*) INTO v_batch_count FROM public.production_batches WHERE recipe_id = p_recipe_id;
  IF v_batch_count > 0 THEN
    -- Used in production: Cannot permanently delete. Archive instead.
    UPDATE public.recipes 
    SET status = 'archived', is_default = false, updated_at = NOW() 
    WHERE id = p_recipe_id;

    INSERT INTO public.audit_logs (
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
  IF v_recipe.status = 'active' OR v_recipe.is_default = true THEN
    RAISE EXCEPTION 'सक्रिय रेसिपी (Active Recipe) को सीधे हटाया नहीं जा सकता। कृपया पहले अन्य संस्करण सक्रिय करें।'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Permanent delete unused draft/archived recipe
  DELETE FROM public.recipe_items WHERE recipe_id = p_recipe_id;
  DELETE FROM public.recipes WHERE id = p_recipe_id;

  INSERT INTO public.audit_logs (
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

-- 7. Permissions & Grants
GRANT EXECUTE ON FUNCTION public.save_recipe_version_transaction(UUID, UUID, TEXT, INTEGER, JSONB, JSONB, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_transaction(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_recipe_version_transaction(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_recipe_version_transaction(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
