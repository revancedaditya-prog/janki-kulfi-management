-- Janki Kulfi Management Schema Migration 008
-- Production Cost Calculator: Ingredient Master, Recipe Master, Overheads & Atomic Costing Transactions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Ingredients Master Table
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other', -- dairy, sweetener, dry_fruit, spice, flavoring, packaging, other
  base_unit TEXT NOT NULL DEFAULT 'kg', -- kg, g, litre, ml, piece, pack
  current_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (current_rate >= 0),
  rate_unit TEXT NOT NULL DEFAULT 'kg', -- litre, kg, piece, pack, etc.
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ingredient Price History Table
CREATE TABLE IF NOT EXISTS ingredient_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  rate NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
  unit TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Recipes Table
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL DEFAULT 'Standard Recipe',
  standard_output_pieces INTEGER NOT NULL DEFAULT 100 CHECK (standard_output_pieces > 0),
  default_overheads JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT true,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_product_recipe_version UNIQUE (product_id, version_number)
);

-- 4. Recipe Items Table
CREATE TABLE IF NOT EXISTS recipe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  is_optional BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Production Batch Ingredients (Permanent Snapshots for Historical Audit)
CREATE TABLE IF NOT EXISTS production_batch_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity_used NUMERIC(12,3) NOT NULL CHECK (quantity_used >= 0),
  unit TEXT NOT NULL,
  converted_base_quantity NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  rate_snapshot NUMERIC(12,2) NOT NULL CHECK (rate_snapshot >= 0),
  rate_unit TEXT NOT NULL,
  calculated_cost NUMERIC(12,2) NOT NULL CHECK (calculated_cost >= 0),
  is_packaging BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Add Costing Columns to production_batches
DO $$
BEGIN
  ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id);
  ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS overhead_costs JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS total_batch_cost NUMERIC(12,2) DEFAULT 0.00;
  ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS cost_per_saleable_piece NUMERIC(12,2) DEFAULT 0.00;
  ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS expected_sales NUMERIC(12,2) DEFAULT 0.00;
  ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS estimated_gross_profit NUMERIC(12,2) DEFAULT 0.00;
  ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS gross_margin_percentage NUMERIC(6,2) DEFAULT 0.00;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category);
CREATE INDEX IF NOT EXISTS idx_ingredients_is_active ON ingredients(is_active);
CREATE INDEX IF NOT EXISTS idx_ingredient_prices_ingredient ON ingredient_prices(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_recipes_is_default ON recipes(product_id, is_default);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_batch_ingredients_batch ON production_batch_ingredients(batch_id);

-- 8. Row Level Security (RLS)
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batch_ingredients ENABLE ROW LEVEL SECURITY;

-- Helper policies creation (Drop old if exist to avoid conflicts on re-run)
DO $$
BEGIN
  -- Ingredients Policies
  DROP POLICY IF EXISTS "Production workers and owners can view ingredients" ON ingredients;
  CREATE POLICY "Production workers and owners can view ingredients"
    ON ingredients FOR SELECT
    TO authenticated
    USING (is_production_or_owner());

  DROP POLICY IF EXISTS "Owners can manage ingredients" ON ingredients;
  CREATE POLICY "Owners can manage ingredients"
    ON ingredients FOR ALL
    TO authenticated
    USING (is_owner())
    WITH CHECK (is_owner());

  -- Ingredient Prices Policies
  DROP POLICY IF EXISTS "Production workers and owners can view ingredient prices" ON ingredient_prices;
  CREATE POLICY "Production workers and owners can view ingredient prices"
    ON ingredient_prices FOR SELECT
    TO authenticated
    USING (is_production_or_owner());

  DROP POLICY IF EXISTS "Owners can manage ingredient prices" ON ingredient_prices;
  CREATE POLICY "Owners can manage ingredient prices"
    ON ingredient_prices FOR ALL
    TO authenticated
    USING (is_owner())
    WITH CHECK (is_owner());

  -- Recipes Policies
  DROP POLICY IF EXISTS "Production workers and owners can view recipes" ON recipes;
  CREATE POLICY "Production workers and owners can view recipes"
    ON recipes FOR SELECT
    TO authenticated
    USING (is_production_or_owner());

  DROP POLICY IF EXISTS "Owners can manage recipes" ON recipes;
  CREATE POLICY "Owners can manage recipes"
    ON recipes FOR ALL
    TO authenticated
    USING (is_owner())
    WITH CHECK (is_owner());

  -- Recipe Items Policies
  DROP POLICY IF EXISTS "Production workers and owners can view recipe items" ON recipe_items;
  CREATE POLICY "Production workers and owners can view recipe items"
    ON recipe_items FOR SELECT
    TO authenticated
    USING (is_production_or_owner());

  DROP POLICY IF EXISTS "Owners can manage recipe items" ON recipe_items;
  CREATE POLICY "Owners can manage recipe items"
    ON recipe_items FOR ALL
    TO authenticated
    USING (is_owner())
    WITH CHECK (is_owner());

  -- Production Batch Ingredients Policies
  DROP POLICY IF EXISTS "Production workers and owners can view batch ingredients" ON production_batch_ingredients;
  CREATE POLICY "Production workers and owners can view batch ingredients"
    ON production_batch_ingredients FOR SELECT
    TO authenticated
    USING (is_production_or_owner());

  DROP POLICY IF EXISTS "Production workers and owners can insert batch ingredients" ON production_batch_ingredients;
  CREATE POLICY "Production workers and owners can insert batch ingredients"
    ON production_batch_ingredients FOR ALL
    TO authenticated
    USING (is_production_or_owner())
    WITH CHECK (is_production_or_owner());
END $$;

-- 9. Seed 14 Standard Ingredients (Using auto-generated UUIDs)
INSERT INTO ingredients (code, name_en, name_hi, category, base_unit, current_rate, rate_unit, is_active)
VALUES
  ('ING-MILK', 'Milk', 'दूध', 'dairy', 'litre', 60.00, 'litre', true),
  ('ING-SUGAR', 'Sugar', 'चीनी', 'sweetener', 'kg', 48.00, 'kg', true),
  ('ING-KHOYA', 'Khoya', 'खोया / मावा', 'dairy', 'kg', 320.00, 'kg', true),
  ('ING-CASHEW', 'Cashew', 'काजू', 'dry_fruit', 'kg', 800.00, 'kg', true),
  ('ING-PISTA', 'Pistachio', 'पिस्ता', 'dry_fruit', 'kg', 1200.00, 'kg', true),
  ('ING-ALMOND', 'Almond', 'बादाम', 'dry_fruit', 'kg', 750.00, 'kg', true),
  ('ING-CUSTARD', 'Custard powder', 'कस्टर्ड पाउडर', 'flavoring', 'kg', 160.00, 'kg', true),
  ('ING-CARDAMOM', 'Cardamom', 'इलायची', 'spice', 'kg', 2400.00, 'kg', true),
  ('ING-SAFFRON', 'Saffron', 'केसर', 'spice', 'g', 250.00, 'g', true),
  ('ING-FLAVOUR', 'Flavour', 'फ्लेवर', 'flavoring', 'ml', 1.50, 'ml', true),
  ('ING-STICK', 'Kulfi stick', 'कुल्फी स्टिक', 'packaging', 'piece', 0.30, 'piece', true),
  ('ING-WRAPPER', 'Wrapper', 'रैपर', 'packaging', 'piece', 0.40, 'piece', true),
  ('ING-POUCH', 'Pouch/packing', 'पैकिंग', 'packaging', 'piece', 0.50, 'piece', true),
  ('ING-OTHER', 'Other ingredient', 'अन्य सामग्री', 'other', 'kg', 100.00, 'kg', true)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_hi = EXCLUDED.name_hi,
  category = EXCLUDED.category,
  base_unit = EXCLUDED.base_unit,
  current_rate = EXCLUDED.current_rate,
  rate_unit = EXCLUDED.rate_unit;

-- 10. Dynamically Link and Seed Default Recipes for Existing Kulfi Products
DO $$
DECLARE
  v_sada_id UUID;
  v_rabri_id UUID;
  v_prem_id UUID;
  v_rec_id UUID;
  v_ing_milk UUID;
  v_ing_sugar UUID;
  v_ing_khoya UUID;
  v_ing_cashew UUID;
  v_ing_pista UUID;
  v_ing_almond UUID;
  v_ing_saffron UUID;
  v_ing_cardamom UUID;
  v_ing_stick UUID;
  v_ing_wrapper UUID;
  v_ing_pouch UUID;
BEGIN
  -- Get product IDs from products table
  SELECT id INTO v_sada_id FROM products WHERE name_en ILIKE '%Sada%' OR name_hi LIKE '%सादा%' LIMIT 1;
  SELECT id INTO v_rabri_id FROM products WHERE name_en ILIKE '%Rabri%' OR name_hi LIKE '%रबड़ी%' OR name_hi LIKE '%रबड़ी%' LIMIT 1;
  SELECT id INTO v_prem_id FROM products WHERE name_en ILIKE '%Premium%' OR name_hi LIKE '%प्रीमियम%' LIMIT 1;

  -- Get ingredient IDs
  SELECT id INTO v_ing_milk FROM ingredients WHERE code = 'ING-MILK';
  SELECT id INTO v_ing_sugar FROM ingredients WHERE code = 'ING-SUGAR';
  SELECT id INTO v_ing_khoya FROM ingredients WHERE code = 'ING-KHOYA';
  SELECT id INTO v_ing_cashew FROM ingredients WHERE code = 'ING-CASHEW';
  SELECT id INTO v_ing_pista FROM ingredients WHERE code = 'ING-PISTA';
  SELECT id INTO v_ing_almond FROM ingredients WHERE code = 'ING-ALMOND';
  SELECT id INTO v_ing_saffron FROM ingredients WHERE code = 'ING-SAFFRON';
  SELECT id INTO v_ing_cardamom FROM ingredients WHERE code = 'ING-CARDAMOM';
  SELECT id INTO v_ing_stick FROM ingredients WHERE code = 'ING-STICK';
  SELECT id INTO v_ing_wrapper FROM ingredients WHERE code = 'ING-WRAPPER';
  SELECT id INTO v_ing_pouch FROM ingredients WHERE code = 'ING-POUCH';

  -- 1. Default Recipe for ₹10 Sada Kulfi
  IF v_sada_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM recipes WHERE product_id = v_sada_id) THEN
    INSERT INTO recipes (product_id, version_number, name, standard_output_pieces, default_overheads, is_default)
    VALUES (v_sada_id, 1, 'Standard Sada 100 pcs', 100, '{"gas":50,"direct_labour":60,"electricity":20,"transport":10,"other":10}'::jsonb, true)
    RETURNING id INTO v_rec_id;

    IF v_ing_milk IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_milk, 10, 'litre', 1); END IF;
    IF v_ing_sugar IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_sugar, 1.2, 'kg', 2); END IF;
    IF v_ing_khoya IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_khoya, 0.5, 'kg', 3); END IF;
    IF v_ing_cardamom IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_cardamom, 15, 'g', 4); END IF;
    IF v_ing_stick IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_stick, 100, 'piece', 5); END IF;
    IF v_ing_wrapper IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_wrapper, 100, 'piece', 6); END IF;
    IF v_ing_pouch IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_pouch, 100, 'piece', 7); END IF;
  END IF;

  -- 2. Default Recipe for ₹20 Rabri Kulfi
  IF v_rabri_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM recipes WHERE product_id = v_rabri_id) THEN
    INSERT INTO recipes (product_id, version_number, name, standard_output_pieces, default_overheads, is_default)
    VALUES (v_rabri_id, 1, 'Standard Rabri 100 pcs', 100, '{"gas":70,"direct_labour":80,"electricity":30,"transport":10,"other":10}'::jsonb, true)
    RETURNING id INTO v_rec_id;

    IF v_ing_milk IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_milk, 15, 'litre', 1); END IF;
    IF v_ing_sugar IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_sugar, 1.8, 'kg', 2); END IF;
    IF v_ing_khoya IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_khoya, 1.5, 'kg', 3); END IF;
    IF v_ing_cashew IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_cashew, 150, 'g', 4); END IF;
    IF v_ing_pista IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_pista, 100, 'g', 5); END IF;
    IF v_ing_cardamom IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_cardamom, 25, 'g', 6); END IF;
    IF v_ing_stick IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_stick, 100, 'piece', 7); END IF;
    IF v_ing_wrapper IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_wrapper, 100, 'piece', 8); END IF;
    IF v_ing_pouch IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_pouch, 100, 'piece', 9); END IF;
  END IF;

  -- 3. Default Recipe for ₹40 Premium Kulfi
  IF v_prem_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM recipes WHERE product_id = v_prem_id) THEN
    INSERT INTO recipes (product_id, version_number, name, standard_output_pieces, default_overheads, is_default)
    VALUES (v_prem_id, 1, 'Standard Premium 100 pcs', 100, '{"gas":90,"direct_labour":100,"electricity":40,"transport":15,"other":15}'::jsonb, true)
    RETURNING id INTO v_rec_id;

    IF v_ing_milk IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_milk, 20, 'litre', 1); END IF;
    IF v_ing_sugar IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_sugar, 2.5, 'kg', 2); END IF;
    IF v_ing_khoya IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_khoya, 3.0, 'kg', 3); END IF;
    IF v_ing_cashew IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_cashew, 300, 'g', 4); END IF;
    IF v_ing_pista IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_pista, 250, 'g', 5); END IF;
    IF v_ing_almond IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_almond, 300, 'g', 6); END IF;
    IF v_ing_saffron IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_saffron, 2, 'g', 7); END IF;
    IF v_ing_cardamom IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_cardamom, 40, 'g', 8); END IF;
    IF v_ing_stick IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_stick, 100, 'piece', 9); END IF;
    IF v_ing_wrapper IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_wrapper, 100, 'piece', 10); END IF;
    IF v_ing_pouch IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rec_id, v_ing_pouch, 100, 'piece', 11); END IF;
  END IF;
END $$;

-- 11. Atomic Costing Production Batch RPC
CREATE OR REPLACE FUNCTION create_production_costing_batch_transaction(
  p_date DATE,
  p_product_id UUID,
  p_recipe_id UUID DEFAULT NULL,
  p_produced_qty INTEGER DEFAULT 0,
  p_damaged_qty INTEGER DEFAULT 0,
  p_total_ingredient_cost NUMERIC(12,2) DEFAULT 0.00,
  p_overhead_costs JSONB DEFAULT '{}'::jsonb,
  p_total_batch_cost NUMERIC(12,2) DEFAULT 0.00,
  p_cost_per_piece NUMERIC(12,2) DEFAULT 0.00,
  p_expected_sales NUMERIC(12,2) DEFAULT 0.00,
  p_gross_profit NUMERIC(12,2) DEFAULT 0.00,
  p_gross_margin NUMERIC(6,2) DEFAULT 0.00,
  p_ingredients JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT '',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_batch_id UUID;
  v_batch_number TEXT;
  v_saleable_qty INTEGER;
  v_ing JSONB;
  v_ing_id UUID;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
BEGIN
  -- Basic validations
  IF p_damaged_qty > p_produced_qty THEN
    RAISE EXCEPTION 'खराब मात्रा (%) उत्पादित मात्रा (%) से अधिक नहीं हो सकती', p_damaged_qty, p_produced_qty;
  END IF;

  v_saleable_qty := p_produced_qty - p_damaged_qty;
  IF v_saleable_qty <= 0 THEN
    RAISE EXCEPTION 'बिक्री योग्य मात्रा (Saleable quantity) 0 से अधिक होनी चाहिए';
  END IF;

  -- Generate batch number (e.g. BAT-20260902-1234)
  v_batch_number := 'BAT-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

  -- Create production batch record
  INSERT INTO production_batches (
    batch_number,
    production_date,
    status,
    total_ingredient_cost,
    recipe_id,
    overhead_costs,
    total_batch_cost,
    cost_per_saleable_piece,
    expected_sales,
    estimated_gross_profit,
    gross_margin_percentage,
    notes,
    completed_at,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_batch_number,
    p_date,
    'completed',
    COALESCE(p_total_ingredient_cost, 0.00),
    p_recipe_id,
    COALESCE(p_overhead_costs, '{}'::jsonb),
    COALESCE(p_total_batch_cost, 0.00),
    COALESCE(p_cost_per_piece, 0.00),
    COALESCE(p_expected_sales, 0.00),
    COALESCE(p_gross_profit, 0.00),
    COALESCE(p_gross_margin, 0.00),
    p_notes,
    NOW(),
    p_user_id,
    NOW(),
    NOW()
  ) RETURNING id INTO v_batch_id;

  -- Insert production item (single product costing item)
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
    p_produced_qty,
    p_damaged_qty,
    v_saleable_qty,
    COALESCE(p_total_ingredient_cost, 0.00),
    COALESCE(p_cost_per_piece, 0.00),
    p_notes
  );

  -- Store ingredient snapshots
  IF p_ingredients IS NOT NULL AND jsonb_array_length(p_ingredients) > 0 THEN
    FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredients) LOOP
      -- Safely parse UUID
      v_ing_id := NULL;
      IF (v_ing->>'ingredient_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_ing_id := (v_ing->>'ingredient_id')::UUID;
      END IF;

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
        is_packaging
      ) VALUES (
        v_batch_id,
        v_ing_id,
        COALESCE(v_ing->>'ingredient_name', 'Ingredient'),
        COALESCE((v_ing->>'quantity_used')::NUMERIC, 0),
        COALESCE(v_ing->>'unit', 'kg'),
        COALESCE((v_ing->>'converted_base_quantity')::NUMERIC, 0),
        COALESCE((v_ing->>'rate_snapshot')::NUMERIC, 0),
        COALESCE(v_ing->>'rate_unit', 'kg'),
        COALESCE((v_ing->>'calculated_cost')::NUMERIC, 0),
        COALESCE((v_ing->>'is_packaging')::BOOLEAN, false)
      );
    END LOOP;
  END IF;

  -- Stock movement into Main Freezer
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');

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
    'Costing Batch Completed: ' || v_batch_number,
    p_user_id
  );

  -- Audit Log
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
    'CREATE_COSTING_BATCH',
    jsonb_build_object(
      'batch_number', v_batch_number,
      'product_id', p_product_id,
      'saleable_qty', v_saleable_qty,
      'total_batch_cost', p_total_batch_cost,
      'cost_per_piece', p_cost_per_piece,
      'gross_margin', p_gross_margin
    ),
    'Completed production batch with recipe costing snapshot',
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'saleable_quantity', v_saleable_qty,
    'cost_per_piece', p_cost_per_piece,
    'message', 'उत्पादन लागत बैच सफलतापूर्वक पूर्ण हुआ एवं स्टॉक फ्रीजर में स्थानांतरित हुआ'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
