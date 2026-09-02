-- Janki Kulfi Management Schema Migration 008
-- Production Cost Calculator: Ingredient Master, Recipe Master, Overheads & Atomic Costing Transactions

-- 1. Ingredients Master Table
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Ingredients Policies
CREATE POLICY "Production workers and owners can view ingredients"
  ON ingredients FOR SELECT
  TO authenticated
  USING (is_production_or_owner());

CREATE POLICY "Owners can manage ingredients"
  ON ingredients FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- Ingredient Prices Policies
CREATE POLICY "Production workers and owners can view ingredient prices"
  ON ingredient_prices FOR SELECT
  TO authenticated
  USING (is_production_or_owner());

CREATE POLICY "Owners can manage ingredient prices"
  ON ingredient_prices FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- Recipes Policies
CREATE POLICY "Production workers and owners can view recipes"
  ON recipes FOR SELECT
  TO authenticated
  USING (is_production_or_owner());

CREATE POLICY "Owners can manage recipes"
  ON recipes FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- Recipe Items Policies
CREATE POLICY "Production workers and owners can view recipe items"
  ON recipe_items FOR SELECT
  TO authenticated
  USING (is_production_or_owner());

CREATE POLICY "Owners can manage recipe items"
  ON recipe_items FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- Production Batch Ingredients Policies
CREATE POLICY "Production workers and owners can view batch ingredients"
  ON production_batch_ingredients FOR SELECT
  TO authenticated
  USING (is_production_or_owner());

CREATE POLICY "Production workers and owners can insert batch ingredients"
  ON production_batch_ingredients FOR ALL
  TO authenticated
  USING (is_production_or_owner())
  WITH CHECK (is_production_or_owner());

-- 9. Seed 14 Standard Ingredients
INSERT INTO ingredients (id, code, name_en, name_hi, category, base_unit, current_rate, rate_unit, is_active)
VALUES
  ('ing-milk-01', 'ING-MILK', 'Milk', 'दूध', 'dairy', 'litre', 60.00, 'litre', true),
  ('ing-sug-02', 'ING-SUGAR', 'Sugar', 'चीनी', 'sweetener', 'kg', 48.00, 'kg', true),
  ('ing-khoy-03', 'ING-KHOYA', 'Khoya', 'खोया / मावा', 'dairy', 'kg', 320.00, 'kg', true),
  ('ing-cash-04', 'ING-CASHEW', 'Cashew', 'काजू', 'dry_fruit', 'kg', 800.00, 'kg', true),
  ('ing-pist-05', 'ING-PISTA', 'Pistachio', 'पिस्ता', 'dry_fruit', 'kg', 1200.00, 'kg', true),
  ('ing-almd-06', 'ING-ALMOND', 'Almond', 'बादाम', 'dry_fruit', 'kg', 750.00, 'kg', true),
  ('ing-cust-07', 'ING-CUSTARD', 'Custard powder', 'कस्टर्ड पाउडर', 'flavoring', 'kg', 160.00, 'kg', true),
  ('ing-card-08', 'ING-CARDAMOM', 'Cardamom', 'इलायची', 'spice', 'kg', 2400.00, 'kg', true),
  ('ing-saff-09', 'ING-SAFFRON', 'Saffron', 'केसर', 'spice', 'gram', 250.00, 'gram', true),
  ('ing-flav-10', 'ING-FLAVOUR', 'Flavour', 'फ्लेवर', 'flavoring', 'ml', 1.50, 'ml', true),
  ('ing-stk-11', 'ING-STICK', 'Kulfi stick', 'कुल्फी स्टिक', 'packaging', 'piece', 0.30, 'piece', true),
  ('ing-wrp-12', 'ING-WRAPPER', 'Wrapper', 'रैपर', 'packaging', 'piece', 0.40, 'piece', true),
  ('ing-pck-13', 'ING-POUCH', 'Pouch/packing', 'पैकिंग', 'packaging', 'piece', 0.50, 'piece', true),
  ('ing-oth-14', 'ING-OTHER', 'Other ingredient', 'अन्य सामग्री', 'other', 'kg', 100.00, 'kg', true)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_hi = EXCLUDED.name_hi,
  category = EXCLUDED.category,
  base_unit = EXCLUDED.base_unit,
  current_rate = EXCLUDED.current_rate,
  rate_unit = EXCLUDED.rate_unit;

-- 10. Atomic Costing Production Batch RPC
CREATE OR REPLACE FUNCTION create_production_costing_batch_transaction(
  p_date DATE,
  p_product_id UUID,
  p_recipe_id UUID,
  p_produced_qty INTEGER,
  p_damaged_qty INTEGER,
  p_total_ingredient_cost NUMERIC(12,2),
  p_overhead_costs JSONB,
  p_total_batch_cost NUMERIC(12,2),
  p_cost_per_piece NUMERIC(12,2),
  p_expected_sales NUMERIC(12,2),
  p_gross_profit NUMERIC(12,2),
  p_gross_margin NUMERIC(6,2),
  p_ingredients JSONB,
  p_notes TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_batch_id UUID;
  v_batch_number TEXT;
  v_saleable_qty INTEGER;
  v_ing JSONB;
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
        (v_ing->>'ingredient_id')::UUID,
        v_ing->>'ingredient_name',
        COALESCE((v_ing->>'quantity_used')::NUMERIC, 0),
        v_ing->>'unit',
        COALESCE((v_ing->>'converted_base_quantity')::NUMERIC, 0),
        COALESCE((v_ing->>'rate_snapshot')::NUMERIC, 0),
        v_ing->>'rate_unit',
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
