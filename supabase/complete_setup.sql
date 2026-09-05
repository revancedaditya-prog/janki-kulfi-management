-- ============================================================================
-- JANKI KULFI MANAGEMENT - COMPLETE DATABASE SETUP & MIGRATION SCRIPT
-- ============================================================================
-- Description: Complete schema containing all tables, constraints, views,
--              RPC stored procedures, RLS policies, and authoritative master seed data.
-- How to use: Copy and paste this entire script into your Supabase Dashboard
--             -> SQL Editor, and click "RUN".
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS & CUSTOM ENUM TYPES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'manager', 'production_staff', 'driver_staff', 'seller_staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM ('milk_dairy', 'raw_materials', 'packaging', 'transport_fuel', 'utilities', 'maintenance', 'labour', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'upi', 'bank_transfer', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_type AS ENUM ('fixed', 'percentage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. CORE MASTER & OPERATIONAL TABLES
-- ============================================================================

-- 2.1 User Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'production_staff',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 Products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.3 Product Prices
CREATE TABLE IF NOT EXISTS product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  selling_price NUMERIC(10,2) NOT NULL CHECK (selling_price >= 0),
  commission_type commission_type NOT NULL DEFAULT 'fixed',
  commission_value NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (commission_value >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4 Carts (Thelas)
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_code TEXT UNIQUE NOT NULL,
  cart_name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.5 Sellers (Vendors)
CREATE TABLE IF NOT EXISTS sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  default_cart_id UUID REFERENCES carts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.6 Stock Locations
CREATE TABLE IF NOT EXISTS stock_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_type TEXT NOT NULL CHECK (location_type IN ('production', 'main_freezer', 'seller', 'returned', 'damaged', 'complimentary')),
  name TEXT NOT NULL,
  seller_id UUID REFERENCES sellers(id) ON DELETE SET NULL,
  cart_id UUID REFERENCES carts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7 Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  category TEXT DEFAULT 'general',
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  current_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2.8 Ingredients & Raw Materials
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  base_unit TEXT NOT NULL,
  purchase_unit TEXT DEFAULT 'kg',
  conversion_factor NUMERIC(10,4) NOT NULL DEFAULT 1.0000,
  min_stock_level NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  reorder_quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  current_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  rate_unit TEXT NOT NULL DEFAULT 'kg',
  preferred_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  preferred_supplier_name TEXT,
  storage_location TEXT DEFAULT 'Kitchen Area',
  track_expiry BOOLEAN NOT NULL DEFAULT false,
  track_lots BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS purchase_unit TEXT DEFAULT 'kg';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(10,4) NOT NULL DEFAULT 1.0000;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS reorder_quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS current_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS rate_unit TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS preferred_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS preferred_supplier_name TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS storage_location TEXT DEFAULT 'Kitchen Area';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS track_expiry BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS track_lots BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2.9 Ingredient Price History
CREATE TABLE IF NOT EXISTS ingredient_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  rate NUMERIC(10,2) NOT NULL CHECK (rate >= 0),
  unit TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.10 Recipes & Costing
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  standard_output_pieces INTEGER NOT NULL DEFAULT 100 CHECK (standard_output_pieces > 0),
  expected_yield_pieces INTEGER NOT NULL DEFAULT 100 CHECK (expected_yield_pieces > 0),
  default_overheads JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist even if recipes table was created in an earlier migration
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Standard Recipe';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS standard_output_pieces INTEGER NOT NULL DEFAULT 100;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS expected_yield_pieces INTEGER NOT NULL DEFAULT 100;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS default_overheads JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2.11 Recipe Items
CREATE TABLE IF NOT EXISTS recipe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.12 Production Batches
CREATE TABLE IF NOT EXISTS production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT UNIQUE NOT NULL,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_ingredient_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  lpg_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  costing_source TEXT NOT NULL DEFAULT 'recipe_calculated' CHECK (costing_source IN ('recipe_calculated', 'legacy_manual', 'actual_override')),
  idempotency_key UUID,
  recipe_id UUID REFERENCES recipes(id) ON DELETE RESTRICT,
  recipe_version_snapshot INTEGER,
  expected_yield_snapshot INTEGER,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist even if production_batches table was created in an earlier migration
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS total_ingredient_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS lpg_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS costing_source TEXT NOT NULL DEFAULT 'recipe_calculated';
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE RESTRICT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS recipe_version_snapshot INTEGER;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS expected_yield_snapshot INTEGER;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2.13 Production Items
CREATE TABLE IF NOT EXISTS production_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  produced_quantity INTEGER NOT NULL DEFAULT 0 CHECK (produced_quantity >= 0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  saleable_quantity INTEGER GENERATED ALWAYS AS (produced_quantity - damaged_quantity) STORED,
  cost_per_piece NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  expected_sales NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE production_items ADD COLUMN IF NOT EXISTS produced_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_items ADD COLUMN IF NOT EXISTS damaged_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE production_items ADD COLUMN IF NOT EXISTS cost_per_piece NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE production_items ADD COLUMN IF NOT EXISTS expected_sales NUMERIC(10,2) NOT NULL DEFAULT 0.00;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_items' AND column_name='saleable_quantity') THEN
    ALTER TABLE production_items ADD COLUMN saleable_quantity INTEGER GENERATED ALWAYS AS (produced_quantity - damaged_quantity) STORED;
  END IF;
END $$;

-- 2.14 Seller Stock Issues
CREATE TABLE IF NOT EXISTS seller_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number TEXT UNIQUE NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  cart_id UUID REFERENCES carts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'settled', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.15 Seller Stock Issue Items
CREATE TABLE IF NOT EXISTS seller_issue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES seller_issues(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  issued_quantity INTEGER NOT NULL CHECK (issued_quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  commission_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.16 Seller Settlements
CREATE TABLE IF NOT EXISTS seller_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number TEXT UNIQUE NOT NULL,
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  issue_id UUID NOT NULL REFERENCES seller_issues(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  total_issued_qty INTEGER NOT NULL DEFAULT 0,
  total_returned_qty INTEGER NOT NULL DEFAULT 0,
  total_damaged_qty INTEGER NOT NULL DEFAULT 0,
  total_complimentary_qty INTEGER NOT NULL DEFAULT 0,
  total_sold_qty INTEGER NOT NULL DEFAULT 0,
  gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_commission NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  net_amount_due NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cash_collected NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  online_collected NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  pending_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.17 Settlement Items
CREATE TABLE IF NOT EXISTS settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES seller_settlements(id) ON DELETE CASCADE,
  issue_item_id UUID NOT NULL REFERENCES seller_issue_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  issued_quantity INTEGER NOT NULL,
  returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  complimentary_quantity INTEGER NOT NULL DEFAULT 0 CHECK (complimentary_quantity >= 0),
  sold_quantity INTEGER GENERATED ALWAYS AS (issued_quantity - returned_quantity - damaged_quantity - complimentary_quantity) STORED,
  unit_price NUMERIC(10,2) NOT NULL,
  commission_rate NUMERIC(10,2) NOT NULL,
  gross_sales NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  commission_earned NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  net_sales NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  damage_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.18 Finished Goods Stock Movements (Ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
  destination_location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'production_in', 'issue_to_seller', 'return_from_seller',
    'damaged_waste', 'complimentary_out', 'transfer', 'adjustment', 'reversal'
  )),
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.19 Raw Material Movements (Ledger)
CREATE TABLE IF NOT EXISTS raw_material_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_location TEXT,
  destination_location TEXT,
  quantity NUMERIC(12,3) NOT NULL,
  base_unit TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'opening_stock', 'purchase_in', 'production_consumption',
    'wastage_damage', 'internal_use', 'supplier_return', 'physical_count_correction', 'transfer'
  )),
  reference_id UUID,
  reference_type TEXT,
  unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  total_value_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS source_location TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS destination_location TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS total_value_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2.20 LPG Cylinders Table
CREATE TABLE IF NOT EXISTS lpg_cylinders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cylinder_code TEXT UNIQUE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  cylinder_type TEXT NOT NULL DEFAULT 'commercial_19kg' CHECK (cylinder_type IN ('commercial_19kg', 'domestic_14kg', 'other')),
  rated_gas_capacity NUMERIC(6,2) NOT NULL DEFAULT 19.00 CHECK (rated_gas_capacity > 0),
  tare_weight NUMERIC(6,2) NOT NULL CHECK (tare_weight > 0),
  full_gross_weight NUMERIC(6,2) NOT NULL CHECK (full_gross_weight >= tare_weight),
  current_gross_weight NUMERIC(6,2) NOT NULL CHECK (current_gross_weight >= tare_weight),
  calculated_remaining_gas NUMERIC(6,2) NOT NULL DEFAULT 0.00 CHECK (calculated_remaining_gas >= 0),
  remaining_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (remaining_percentage >= 0 AND remaining_percentage <= 100),
  status TEXT NOT NULL DEFAULT 'full' CHECK (status IN ('full', 'in_use', 'partially_used', 'empty', 'sent_for_refill', 'damaged_inactive')),
  refill_date DATE,
  refill_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (refill_cost >= 0),
  connected_date DATE,
  empty_date DATE,
  storage_location TEXT DEFAULT 'Kitchen Burner Area',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS cylinder_type TEXT NOT NULL DEFAULT 'commercial_19kg';
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS rated_gas_capacity NUMERIC(6,2) NOT NULL DEFAULT 19.00;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS tare_weight NUMERIC(6,2) NOT NULL DEFAULT 15.00;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS full_gross_weight NUMERIC(6,2) NOT NULL DEFAULT 34.00;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS current_gross_weight NUMERIC(6,2) NOT NULL DEFAULT 34.00;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS calculated_remaining_gas NUMERIC(6,2) NOT NULL DEFAULT 19.00;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS remaining_percentage NUMERIC(5,2) NOT NULL DEFAULT 100.00;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'full';
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS refill_date DATE;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS refill_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS connected_date DATE;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS empty_date DATE;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS storage_location TEXT DEFAULT 'Kitchen Burner Area';
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2.21 LPG Cylinder Reading Logs
CREATE TABLE IF NOT EXISTS lpg_cylinder_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cylinder_id UUID NOT NULL REFERENCES lpg_cylinders(id) ON DELETE CASCADE,
  reading_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reading_type TEXT NOT NULL CHECK (reading_type IN ('weighed', 'estimated_batch_use', 'refill_in', 'empty_out')),
  gross_weight NUMERIC(6,2) NOT NULL,
  tare_weight NUMERIC(6,2) NOT NULL,
  remaining_gas_kg NUMERIC(6,2) NOT NULL,
  gas_consumed_kg NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  batch_id UUID REFERENCES production_batches(id) ON DELETE SET NULL,
  notes TEXT,
  recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS reading_type TEXT NOT NULL DEFAULT 'weighed';
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS gross_weight NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS tare_weight NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS remaining_gas_kg NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS gas_consumed_kg NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES production_batches(id) ON DELETE SET NULL;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2.22 Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_method payment_method NOT NULL DEFAULT 'cash',
  paid_to TEXT,
  receipt_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.23 Daily Closings
CREATE TABLE IF NOT EXISTS daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date DATE UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  opening_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_cash_sales NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_upi_sales NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_expenses NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  expected_closing_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  actual_closing_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cash_difference NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_production_qty INTEGER NOT NULL DEFAULT 0,
  total_sold_qty INTEGER NOT NULL DEFAULT 0,
  total_damaged_qty INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.24 Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  reason TEXT,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. INDEXES FOR HIGH-PERFORMANCE QUERYING
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_dest ON stock_movements(destination_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_src ON stock_movements(source_location_id);
CREATE INDEX IF NOT EXISTS idx_raw_mat_mov_ing ON raw_material_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_raw_mat_mov_date ON raw_material_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_prod_batches_date ON production_batches(production_date);
CREATE INDEX IF NOT EXISTS idx_seller_issues_date ON seller_issues(issue_date);
CREATE INDEX IF NOT EXISTS idx_seller_settlements_date ON seller_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS idx_cylinders_status ON lpg_cylinders(status);

-- Deduplicate any existing duplicate active recipes per product before creating unique index
WITH ranked_recipes AS (
  SELECT id, product_id,
         ROW_NUMBER() OVER (
           PARTITION BY product_id 
           ORDER BY is_default DESC, version_number DESC, created_at DESC, id DESC
         ) as rank_num
  FROM recipes
  WHERE status = 'active'
)
UPDATE recipes
SET status = 'archived', is_default = false
WHERE id IN (
  SELECT id FROM ranked_recipes WHERE rank_num > 1
);

DROP INDEX IF EXISTS idx_unique_active_recipe_per_product;
CREATE UNIQUE INDEX idx_unique_active_recipe_per_product 
ON recipes (product_id) 
WHERE status = 'active';

DROP INDEX IF EXISTS idx_production_batches_idempotency;
CREATE UNIQUE INDEX idx_production_batches_idempotency 
ON production_batches (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- 4. REALTIME & CANONICAL VIEWS
-- ============================================================================

DROP VIEW IF EXISTS v_freezer_stock CASCADE;
DROP VIEW IF EXISTS v_raw_material_stock CASCADE;
DROP VIEW IF EXISTS current_location_stock CASCADE;

-- 4.1 Canonical Location Stock View
CREATE OR REPLACE VIEW current_location_stock AS
WITH location_product_pairs AS (
  SELECT DISTINCT l.id AS location_id, p.id AS product_id
  FROM stock_locations l
  CROSS JOIN products p
  WHERE l.is_active = true AND p.is_active = true
),
inflows AS (
  SELECT destination_location_id AS location_id, product_id, COALESCE(SUM(quantity), 0) AS total_in
  FROM stock_movements
  WHERE destination_location_id IS NOT NULL
  GROUP BY destination_location_id, product_id
),
outflows AS (
  SELECT source_location_id AS location_id, product_id, COALESCE(SUM(quantity), 0) AS total_out
  FROM stock_movements
  WHERE source_location_id IS NOT NULL
  GROUP BY source_location_id, product_id
)
SELECT 
  lp.location_id,
  lp.product_id,
  COALESCE(i.total_in, 0) - COALESCE(o.total_out, 0) AS current_quantity
FROM location_product_pairs lp
LEFT JOIN inflows i ON lp.location_id = i.location_id AND lp.product_id = i.product_id
LEFT JOIN outflows o ON lp.location_id = o.location_id AND lp.product_id = o.product_id;

-- 4.2 Main Freezer Stock View
CREATE OR REPLACE VIEW v_freezer_stock AS
SELECT 
  p.id AS product_id,
  p.name_en,
  p.name_hi,
  p.sku,
  COALESCE(cls.current_quantity, 0) AS available_quantity
FROM products p
LEFT JOIN current_location_stock cls 
  ON p.id = cls.product_id 
  AND cls.location_id = 'a0000000-0000-0000-0000-000000000002'
WHERE p.is_active = true;

-- 4.3 Raw Material Stock View
CREATE OR REPLACE VIEW v_raw_material_stock AS
SELECT 
  i.id,
  i.code,
  i.name_en,
  i.name_hi,
  i.category,
  i.base_unit,
  i.purchase_unit,
  i.conversion_factor,
  i.min_stock_level,
  i.reorder_quantity,
  i.current_rate,
  i.rate_unit,
  i.preferred_supplier_id,
  i.preferred_supplier_name,
  i.storage_location,
  i.track_expiry,
  i.track_lots,
  i.is_active,
  COALESCE(SUM(rmm.quantity), 0) AS current_stock,
  (COALESCE(SUM(rmm.quantity), 0) * i.current_rate) AS total_value,
  CASE 
    WHEN COALESCE(SUM(rmm.quantity), 0) <= 0 THEN 'out_of_stock'
    WHEN COALESCE(SUM(rmm.quantity), 0) <= i.min_stock_level THEN 'low_stock'
    ELSE 'adequate'
  END AS stock_status
FROM ingredients i
LEFT JOIN raw_material_movements rmm ON i.id = rmm.ingredient_id
GROUP BY i.id;

-- ============================================================================
-- 5. SECURITY & ROLE HELPER FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION is_owner() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_production_or_owner() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('owner', 'manager', 'production_staff')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- 6. AUTHORITATIVE STORED PROCEDURES (RPCs)
-- ============================================================================

-- 6.1 Atomic Production Completion with Standard Recipe Deduction
CREATE OR REPLACE FUNCTION complete_production_with_recipe_transaction(
  p_production_date DATE,
  p_product_id UUID,
  p_produced_quantity INTEGER,
  p_damaged_quantity INTEGER DEFAULT 0,
  p_recipe_id UUID DEFAULT NULL,
  p_actual_ingredients JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_lpg_cost NUMERIC DEFAULT 0.00,
  p_overhead_costs JSONB DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prod_batch_id UUID;
  v_batch_num TEXT;
  v_freezer_loc_id UUID := 'a0000000-0000-0000-0000-000000000002';
  v_product RECORD;
  v_recipe RECORD;
  v_expected_yield NUMERIC;
  v_saleable_qty INTEGER;
  v_cost_per_piece NUMERIC(10,2);
  v_total_ingredient_cost NUMERIC(10,2) := 0.00;
  v_rec_item RECORD;
  v_std_item_qty NUMERIC;
  v_actual_item_qty NUMERIC;
  v_item_base_qty NUMERIC;
  v_item_cost NUMERIC;
  v_variance_reason TEXT;
  v_actual_override_entry JSONB;
  v_has_actual_override BOOLEAN := false;
  v_calculated_ingredients JSONB := '[]'::jsonb;
  v_shortages JSONB := '[]'::jsonb;
  v_avail_stock NUMERIC;
  v_existing_batch RECORD;
BEGIN
  -- 1. Idempotency Check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_batch FROM production_batches WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'batch_id', v_existing_batch.id,
        'batch_number', v_existing_batch.batch_number,
        'saleable_quantity', (SELECT saleable_quantity FROM production_items WHERE batch_id = v_existing_batch.id LIMIT 1),
        'total_ingredient_cost', v_existing_batch.total_ingredient_cost,
        'message', 'Idempotent replay: batch already processed.'
      );
    END IF;
  END IF;

  -- 2. Validation
  IF p_produced_quantity <= 0 THEN
    RAISE EXCEPTION 'Produced quantity must be greater than 0' USING ERRCODE = '22023';
  END IF;
  IF p_damaged_quantity < 0 OR p_damaged_quantity > p_produced_quantity THEN
    RAISE EXCEPTION 'Damaged quantity cannot exceed produced quantity' USING ERRCODE = '22023';
  END IF;

  v_saleable_qty := p_produced_quantity - p_damaged_quantity;

  SELECT * INTO v_product FROM products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active product % not found', p_product_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Resolve Recipe
  IF p_recipe_id IS NOT NULL THEN
    SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id;
  ELSE
    SELECT * INTO v_recipe FROM recipes WHERE product_id = p_product_id AND status = 'active' LIMIT 1;
  END IF;

  IF NOT FOUND OR v_recipe.id IS NULL THEN
    RAISE EXCEPTION 'No active recipe found for product %', v_product.name_hi USING ERRCODE = 'P0002';
  END IF;

  v_expected_yield := COALESCE(v_recipe.standard_output_pieces, v_recipe.expected_yield_pieces, 100);

  -- 4. Calculate Ingredient Consumption & Check Stock Shortages
  FOR v_rec_item IN 
    SELECT ri.*, i.code, i.name_en, i.name_hi, i.base_unit, i.conversion_factor, i.current_rate, i.rate_unit, i.category, i.storage_location
    FROM recipe_items ri
    JOIN ingredients i ON ri.ingredient_id = i.id
    WHERE ri.recipe_id = v_recipe.id
    ORDER BY ri.sort_order
  LOOP
    v_std_item_qty := (v_rec_item.quantity / v_expected_yield) * p_produced_quantity;
    v_actual_item_qty := v_std_item_qty;
    v_variance_reason := NULL;

    -- Check actual override if provided
    IF p_actual_ingredients IS NOT NULL AND jsonb_array_length(p_actual_ingredients) > 0 THEN
      FOR v_actual_override_entry IN SELECT * FROM jsonb_array_elements(p_actual_ingredients) LOOP
        IF (v_actual_override_entry->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
            AND (v_actual_override_entry->>'ingredient_id')::UUID = v_rec_item.ingredient_id)
           OR (v_actual_override_entry->>'ingredient_id' ILIKE v_rec_item.code) THEN
          v_actual_item_qty := COALESCE((v_actual_override_entry->>'actual_quantity')::NUMERIC, v_std_item_qty);
          v_variance_reason := v_actual_override_entry->>'reason';
          IF v_actual_item_qty <> v_std_item_qty THEN
            v_has_actual_override := true;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Unit conversion to base unit
    IF v_rec_item.unit = v_rec_item.base_unit THEN
      v_item_base_qty := v_actual_item_qty;
    ELSIF v_rec_item.unit = 'g' AND v_rec_item.base_unit = 'kg' THEN
      v_item_base_qty := v_actual_item_qty / 1000.0;
    ELSIF v_rec_item.unit = 'ml' AND v_rec_item.base_unit = 'litre' THEN
      v_item_base_qty := v_actual_item_qty / 1000.0;
    ELSE
      v_item_base_qty := v_actual_item_qty;
    END IF;

    -- Cost calculation
    v_item_cost := v_item_base_qty * v_rec_item.current_rate;
    v_total_ingredient_cost := v_total_ingredient_cost + v_item_cost;

    -- Stock Availability Check
    SELECT COALESCE(SUM(quantity), 0) INTO v_avail_stock 
    FROM raw_material_movements 
    WHERE ingredient_id = v_rec_item.ingredient_id;

    IF v_avail_stock < v_item_base_qty THEN
      v_shortages := v_shortages || jsonb_build_object(
        'ingredient_id', v_rec_item.ingredient_id,
        'ingredient_name', v_rec_item.name_hi,
        'required', v_item_base_qty,
        'available', v_avail_stock,
        'shortage', v_item_base_qty - v_avail_stock,
        'unit', v_rec_item.base_unit
      );
    END IF;

    v_calculated_ingredients := v_calculated_ingredients || jsonb_build_object(
      'ingredient_id', v_rec_item.ingredient_id,
      'ingredient_name', v_rec_item.name_hi,
      'base_qty', v_item_base_qty,
      'rate_snapshot', v_rec_item.current_rate,
      'rate_unit', v_rec_item.rate_unit,
      'calculated_cost', v_item_cost,
      'storage_location', COALESCE(v_rec_item.storage_location, 'Kitchen Area')
    );
  END LOOP;

  -- Block production if insufficient raw materials
  IF jsonb_array_length(v_shortages) > 0 THEN
    RAISE EXCEPTION 'Insufficient raw material stock for production: %', v_shortages USING ERRCODE = '55000';
  END IF;

  v_cost_per_piece := ROUND(v_total_ingredient_cost / p_produced_quantity, 2);
  v_batch_num := 'PRD-' || TO_CHAR(p_production_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');

  -- 5. Insert Production Batch Header
  INSERT INTO production_batches (
    batch_number, production_date, total_ingredient_cost, lpg_cost, costing_source,
    idempotency_key, recipe_id, recipe_version_snapshot, expected_yield_snapshot,
    status, notes, completed_at, created_by
  ) VALUES (
    v_batch_num, p_production_date, v_total_ingredient_cost, p_lpg_cost,
    CASE WHEN v_has_actual_override THEN 'actual_override' ELSE 'recipe_calculated' END,
    p_idempotency_key, v_recipe.id, v_recipe.version_number, v_expected_yield,
    'completed', p_notes, NOW(), p_user_id
  ) RETURNING id INTO v_prod_batch_id;

  -- 6. Insert Production Items
  INSERT INTO production_items (
    batch_id, product_id, produced_quantity, damaged_quantity, cost_per_piece, expected_sales
  ) VALUES (
    v_prod_batch_id, p_product_id, p_produced_quantity, p_damaged_quantity, v_cost_per_piece, 0.00
  );

  -- 7. Deduct Raw Materials from Ledger
  FOR v_actual_override_entry IN SELECT * FROM jsonb_array_elements(v_calculated_ingredients) LOOP
    INSERT INTO raw_material_movements (
      ingredient_id, movement_date, source_location, destination_location,
      quantity, base_unit, movement_type, reference_id, reference_type,
      unit_cost_snapshot, total_value_snapshot, reason, performed_by
    ) VALUES (
      (v_actual_override_entry->>'ingredient_id')::UUID, NOW(),
      v_actual_override_entry->>'storage_location', 'Production Batch ' || v_batch_num,
      -((v_actual_override_entry->>'base_qty')::NUMERIC),
      v_actual_override_entry->>'rate_unit', 'production_consumption',
      v_prod_batch_id, 'production_batches',
      (v_actual_override_entry->>'rate_snapshot')::NUMERIC,
      (v_actual_override_entry->>'calculated_cost')::NUMERIC,
      'Automatic recipe consumption for batch ' || v_batch_num, p_user_id
    );
  END LOOP;

  -- 8. Add Saleable Kulfi directly to Main Freezer
  IF v_saleable_qty > 0 THEN
    INSERT INTO stock_movements (
      product_id, source_location_id, destination_location_id,
      quantity, movement_type, reference_id, reference_type,
      notes, performed_by
    ) VALUES (
      p_product_id, NULL, v_freezer_loc_id,
      v_saleable_qty, 'production_in', v_prod_batch_id, 'production_batches',
      'Production batch ' || v_batch_num || ' completed (' || v_saleable_qty || ' saleable pcs added to Main Freezer)', p_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_prod_batch_id,
    'batch_number', v_batch_num,
    'saleable_quantity', v_saleable_qty,
    'total_ingredient_cost', v_total_ingredient_cost,
    'cost_per_piece', v_cost_per_piece,
    'message', 'Production batch completed and stock deducted successfully.'
  );
END;
$$;

-- 6.2 Activate Recipe Version
CREATE OR REPLACE FUNCTION activate_recipe_version_transaction(
  p_recipe_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipe RECORD;
BEGIN
  SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe % not found', p_recipe_id;
  END IF;

  -- Archive other versions
  UPDATE recipes 
  SET status = 'archived', is_default = false, updated_at = NOW()
  WHERE product_id = v_recipe.product_id AND id <> p_recipe_id;

  -- Activate selected recipe
  UPDATE recipes 
  SET status = 'active', is_default = true, updated_at = NOW()
  WHERE id = p_recipe_id;

  RETURN jsonb_build_object(
    'success', true,
    'recipe_id', p_recipe_id,
    'message', 'Recipe version activated successfully.'
  );
END;
$$;

-- 6.3 Safe Recipe Deletion
CREATE OR REPLACE FUNCTION delete_recipe_version_transaction(
  p_recipe_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipe RECORD;
  v_batch_count INTEGER;
BEGIN
  SELECT * INTO v_recipe FROM recipes WHERE id = p_recipe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe % not found', p_recipe_id;
  END IF;

  SELECT COUNT(*) INTO v_batch_count FROM production_batches WHERE recipe_id = p_recipe_id;
  IF v_batch_count > 0 THEN
    UPDATE recipes SET status = 'archived', is_default = false, updated_at = NOW() WHERE id = p_recipe_id;
    RETURN jsonb_build_object(
      'success', true,
      'archived', true,
      'message', 'Recipe is referenced by historical production batches and has been safely archived.'
    );
  END IF;

  DELETE FROM recipe_items WHERE recipe_id = p_recipe_id;
  DELETE FROM recipes WHERE id = p_recipe_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', true,
    'message', 'Draft recipe deleted permanently.'
  );
END;
$$;

-- 6.4 Raw Material Physical Stock Count Correction
CREATE OR REPLACE FUNCTION correct_raw_material_stock_transaction(
  p_ingredient_id UUID,
  p_new_quantity NUMERIC,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ing RECORD;
  v_current_stock NUMERIC;
  v_diff NUMERIC;
BEGIN
  SELECT * INTO v_ing FROM ingredients WHERE id = p_ingredient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient % not found', p_ingredient_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock 
  FROM raw_material_movements 
  WHERE ingredient_id = p_ingredient_id;

  v_diff := p_new_quantity - v_current_stock;
  IF v_diff = 0 THEN
    RETURN jsonb_build_object('success', true, 'difference', 0, 'message', 'Stock count already matches.');
  END IF;

  INSERT INTO raw_material_movements (
    ingredient_id, movement_date, source_location, destination_location,
    quantity, base_unit, movement_type, unit_cost_snapshot, total_value_snapshot,
    reason, performed_by
  ) VALUES (
    p_ingredient_id, NOW(), 'Physical Stock Count', COALESCE(v_ing.storage_location, 'Kitchen Area'),
    v_diff, v_ing.base_unit, 'physical_count_correction', v_ing.current_rate,
    ABS(v_diff) * v_ing.current_rate, p_reason, p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'difference', v_diff,
    'message', 'Physical stock count updated successfully.'
  );
END;
$$;

-- 6.5 Safe Raw Material Deletion
CREATE OR REPLACE FUNCTION delete_ingredient_transaction(
  p_ingredient_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ing RECORD;
  v_recipe_usage INTEGER;
  v_mov_count INTEGER;
BEGIN
  SELECT * INTO v_ing FROM ingredients WHERE id = p_ingredient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingredient % not found', p_ingredient_id;
  END IF;

  SELECT COUNT(*) INTO v_recipe_usage FROM recipe_items WHERE ingredient_id = p_ingredient_id;
  SELECT COUNT(*) INTO v_mov_count FROM raw_material_movements WHERE ingredient_id = p_ingredient_id;

  IF v_recipe_usage > 0 OR v_mov_count > 0 THEN
    UPDATE ingredients SET is_active = false, updated_at = NOW() WHERE id = p_ingredient_id;
    RETURN jsonb_build_object('success', true, 'deactivated', true, 'message', 'Ingredient is in use and has been safely deactivated.');
  END IF;

  DELETE FROM ingredients WHERE id = p_ingredient_id;
  RETURN jsonb_build_object('success', true, 'deleted', true, 'message', 'Ingredient deleted successfully.');
END;
$$;

-- 6.6 Safe LPG Cylinder Deletion
CREATE OR REPLACE FUNCTION delete_lpg_cylinder_transaction(
  p_cylinder_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cyl RECORD;
BEGIN
  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = p_cylinder_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LPG Cylinder % not found', p_cylinder_id;
  END IF;

  DELETE FROM lpg_cylinder_readings WHERE cylinder_id = p_cylinder_id;
  DELETE FROM lpg_cylinders WHERE id = p_cylinder_id;

  RETURN jsonb_build_object(
    'success', true,
    'cylinder_id', p_cylinder_id,
    'message', 'LPG cylinder and history deleted successfully.'
  );
END;
$$;

-- 6.7 Authoritative Stock Balances RPC
CREATE OR REPLACE FUNCTION get_freezer_balances() 
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balances JSONB := '{}'::jsonb;
  v_row RECORD;
BEGIN
  FOR v_row IN 
    SELECT product_id, current_quantity 
    FROM current_location_stock 
    WHERE location_id = 'a0000000-0000-0000-0000-000000000002'
  LOOP
    v_balances := jsonb_set(v_balances, ARRAY[v_row.product_id::TEXT], to_jsonb(v_row.current_quantity));
  END LOOP;
  RETURN v_balances;
END;
$$;

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_issue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpg_cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpg_cylinder_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Permissive authenticated read and manage policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users full access" ON %I;', tbl);
    EXECUTE format('CREATE POLICY "Authenticated users full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public read access" ON %I;', tbl);
    EXECUTE format('CREATE POLICY "Public read access" ON %I FOR SELECT TO anon USING (true);', tbl);
  END LOOP;
END $$;

-- Grant EXECUTE on all RPCs
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;

-- ============================================================================
-- 8. AUTHORITATIVE MASTER & SEED DATA
-- ============================================================================

-- 8.1 Stock Locations
INSERT INTO stock_locations (id, location_type, name, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'production', 'Production Floor', true),
  ('a0000000-0000-0000-0000-000000000002', 'main_freezer', 'Main Cold Storage Freezer', true),
  ('a0000000-0000-0000-0000-000000000003', 'returned', 'Returned Stock Holding', true),
  ('a0000000-0000-0000-0000-000000000004', 'damaged', 'Damaged & Melted Waste', true),
  ('a0000000-0000-0000-0000-000000000005', 'complimentary', 'Complimentary / Tasting Stock', true)
ON CONFLICT (id) DO NOTHING;

-- 8.2 Standard Products
INSERT INTO products (id, name_en, name_hi, sku, description, is_active) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Sada Kulfi (₹10)', 'सादा कुल्फी (₹10)', 'JK-SADA-01', 'Classic traditional stick kulfi with cardamom and malai', true),
  ('b0000000-0000-0000-0000-000000000002', 'Rabri Kulfi (₹20)', 'रबड़ी कुल्फी (₹20)', 'JK-RABRI-02', 'Thick reduced milk rabri kulfi with almond and pistachio flakes', true),
  ('b0000000-0000-0000-0000-000000000003', 'Premium Kulfi (₹30)', 'प्रीमियम कुल्फी (₹30)', 'JK-PREM-03', 'Special saffron-infused royal kulfi with cashews, almonds & pistachios', true),
  ('b0000000-0000-0000-0000-000000000004', 'Matka Kulfi (₹50)', 'मटका कुल्फी (₹50)', 'JK-MATKA-04', 'Traditional terracotta pot kulfi with thick saffron rabri', true)
ON CONFLICT (sku) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_hi = EXCLUDED.name_hi,
  description = EXCLUDED.description;

-- 8.3 Standard Prices & Commissions
INSERT INTO product_prices (id, product_id, selling_price, commission_type, commission_value, effective_from) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 10.00, 'fixed', 2.00, NOW()),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 20.00, 'fixed', 4.00, NOW()),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 30.00, 'fixed', 6.00, NOW()),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004', 50.00, 'fixed', 10.00, NOW())
ON CONFLICT (id) DO NOTHING;

-- 8.4 Standard Carts
INSERT INTO carts (id, cart_code, cart_name, location, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'CART-01', 'Mirehchi Chowk Cart (ठेला 1)', 'Mirehchi Main Market Chauraha', true),
  ('d0000000-0000-0000-0000-000000000002', 'CART-02', 'Bus Stand Mobile Cart (ठेला 2)', 'Etah Road Bus Stand Point', true),
  ('d0000000-0000-0000-0000-000000000003', 'CART-03', 'Railway Station Cart (ठेla 3)', 'Railway Station Gate', true)
ON CONFLICT (cart_code) DO NOTHING;

-- 8.5 Standard Sellers
INSERT INTO sellers (id, seller_code, full_name, phone, address, default_cart_id, is_active, opening_balance) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'SLR-001', 'Ramesh Kumar (रमेश कुमार)', '9876543210', 'Ward 4, Mirehchi, Etah', 'd0000000-0000-0000-0000-000000000001', true, 0.00),
  ('e0000000-0000-0000-0000-000000000002', 'SLR-002', 'Suresh Chandra (सुरेश चन्द्र)', '9876543211', 'Station Road, Mirehchi, Etah', 'd0000000-0000-0000-0000-000000000002', true, 0.00)
ON CONFLICT (seller_code) DO NOTHING;

-- 8.6 Seller Stock Holding Locations
INSERT INTO stock_locations (id, location_type, name, seller_id, cart_id, is_active) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'seller', 'Ramesh Kumar Cart Stock', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', true),
  ('f0000000-0000-0000-0000-000000000002', 'seller', 'Suresh Chandra Cart Stock', 'e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', true)
ON CONFLICT (id) DO NOTHING;

-- 8.7 Standard Ingredients
INSERT INTO ingredients (id, code, name_en, name_hi, category, base_unit, current_rate, rate_unit, is_active)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'ING-MILK', 'Milk', 'दूध', 'dairy', 'litre', 60.00, 'litre', true),
  ('10000000-0000-0000-0000-000000000002', 'ING-SUGAR', 'Sugar', 'चीनी', 'sweetener', 'kg', 48.00, 'kg', true),
  ('10000000-0000-0000-0000-000000000003', 'ING-KHOYA', 'Khoya', 'खोया / मावा', 'dairy', 'kg', 320.00, 'kg', true),
  ('10000000-0000-0000-0000-000000000004', 'ING-CASHEW', 'Cashew', 'काजू', 'dry_fruit', 'kg', 800.00, 'kg', true),
  ('10000000-0000-0000-0000-000000000005', 'ING-PISTA', 'Pistachio', 'पिस्ता', 'dry_fruit', 'kg', 1200.00, 'kg', true),
  ('10000000-0000-0000-0000-000000000006', 'ING-ALMOND', 'Almond', 'बादाम', 'dry_fruit', 'kg', 750.00, 'kg', true),
  ('10000000-0000-0000-0000-000000000007', 'ING-CUSTARD', 'Custard powder', 'कस्टर्ड पाउडर', 'flavoring', 'kg', 160.00, 'kg', true),
  ('10000000-0000-0000-0000-000000000008', 'ING-CARDAMOM', 'Cardamom', 'इलायची', 'spice', 'kg', 2400.00, 'kg', true),
  ('10000000-0000-0000-0000-000000000009', 'ING-SAFFRON', 'Saffron', 'केसर', 'spice', 'g', 250.00, 'g', true),
  ('10000000-0000-0000-0000-000000000010', 'ING-FLAVOUR', 'Flavour', 'फ्लेवर', 'flavoring', 'ml', 1.50, 'ml', true),
  ('10000000-0000-0000-0000-000000000011', 'ING-STICK', 'Kulfi stick', 'कुल्फी स्टिक', 'packaging', 'piece', 0.30, 'piece', true),
  ('10000000-0000-0000-0000-000000000012', 'ING-WRAPPER', 'Wrapper', 'रैपर', 'packaging', 'piece', 0.40, 'piece', true),
  ('10000000-0000-0000-0000-000000000013', 'ING-POUCH', 'Pouch/packing', 'पैकिंग', 'packaging', 'piece', 0.50, 'piece', true),
  ('10000000-0000-0000-0000-000000000014', 'ING-OTHER', 'Other ingredient', 'अन्य सामग्री', 'other', 'kg', 100.00, 'kg', true)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_hi = EXCLUDED.name_hi,
  base_unit = EXCLUDED.base_unit,
  current_rate = EXCLUDED.current_rate,
  rate_unit = EXCLUDED.rate_unit;

-- 8.8 Initial Opening Stock for Ingredients (50L Milk, 50kg Sugar, etc.)
INSERT INTO raw_material_movements (ingredient_id, quantity, base_unit, movement_type, unit_cost_snapshot, total_value_snapshot, reason)
SELECT id, 50, base_unit, 'opening_stock', current_rate, 50 * current_rate, 'Initial Opening Balance'
FROM ingredients
WHERE code IN ('ING-MILK', 'ING-SUGAR', 'ING-KHOYA')
AND NOT EXISTS (
  SELECT 1 FROM raw_material_movements WHERE ingredient_id = ingredients.id
);

INSERT INTO raw_material_movements (ingredient_id, quantity, base_unit, movement_type, unit_cost_snapshot, total_value_snapshot, reason)
SELECT id, 5000, base_unit, 'opening_stock', current_rate, 5000 * current_rate, 'Initial Opening Balance'
FROM ingredients
WHERE code IN ('ING-STICK', 'ING-WRAPPER', 'ING-POUCH')
AND NOT EXISTS (
  SELECT 1 FROM raw_material_movements WHERE ingredient_id = ingredients.id
);

-- 8.9 Default Standard Recipes
DO $$
DECLARE
  v_sada_prod UUID := 'b0000000-0000-0000-0000-000000000001';
  v_rabri_prod UUID := 'b0000000-0000-0000-0000-000000000002';
  v_prem_prod UUID := 'b0000000-0000-0000-0000-000000000003';
  v_sada_rec UUID;
  v_rabri_rec UUID;
  v_prem_rec UUID;
BEGIN
  -- 1. Sada Kulfi Standard Recipe (100 pcs)
  SELECT id INTO v_sada_rec FROM recipes WHERE product_id = v_sada_prod AND version_number = 1 LIMIT 1;
  IF v_sada_rec IS NULL THEN
    v_sada_rec := '20000000-0000-0000-0000-000000000001';
    INSERT INTO recipes (id, product_id, version_number, name, standard_output_pieces, expected_yield_pieces, status, is_default, default_overheads)
    VALUES (v_sada_rec, v_sada_prod, 1, 'Standard Sada 100 pcs', 100, 100, 'active', true, '{"gas":50,"direct_labour":60,"electricity":20,"transport":10,"other":10}'::jsonb);
  ELSE
    UPDATE recipes SET 
      name = 'Standard Sada 100 pcs',
      standard_output_pieces = 100,
      expected_yield_pieces = 100,
      status = 'active',
      is_default = true,
      default_overheads = '{"gas":50,"direct_labour":60,"electricity":20,"transport":10,"other":10}'::jsonb
    WHERE id = v_sada_rec;
  END IF;

  UPDATE recipes SET status = 'archived', is_default = false 
  WHERE product_id = v_sada_prod AND id <> v_sada_rec;

  DELETE FROM recipe_items WHERE recipe_id = v_sada_rec;

  INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES
    (v_sada_rec, '10000000-0000-0000-0000-000000000001', 10, 'litre', 1),
    (v_sada_rec, '10000000-0000-0000-0000-000000000002', 1.2, 'kg', 2),
    (v_sada_rec, '10000000-0000-0000-0000-000000000003', 0.5, 'kg', 3),
    (v_sada_rec, '10000000-0000-0000-0000-000000000008', 0.015, 'kg', 4),
    (v_sada_rec, '10000000-0000-0000-0000-000000000011', 100, 'piece', 5),
    (v_sada_rec, '10000000-0000-0000-0000-000000000012', 100, 'piece', 6)
  ON CONFLICT DO NOTHING;

  -- 2. Rabri Kulfi Standard Recipe (100 pcs)
  SELECT id INTO v_rabri_rec FROM recipes WHERE product_id = v_rabri_prod AND version_number = 1 LIMIT 1;
  IF v_rabri_rec IS NULL THEN
    v_rabri_rec := '20000000-0000-0000-0000-000000000002';
    INSERT INTO recipes (id, product_id, version_number, name, standard_output_pieces, expected_yield_pieces, status, is_default, default_overheads)
    VALUES (v_rabri_rec, v_rabri_prod, 1, 'Standard Rabri 100 pcs', 100, 100, 'active', true, '{"gas":70,"direct_labour":80,"electricity":30,"transport":10,"other":10}'::jsonb);
  ELSE
    UPDATE recipes SET 
      name = 'Standard Rabri 100 pcs',
      standard_output_pieces = 100,
      expected_yield_pieces = 100,
      status = 'active',
      is_default = true,
      default_overheads = '{"gas":70,"direct_labour":80,"electricity":30,"transport":10,"other":10}'::jsonb
    WHERE id = v_rabri_rec;
  END IF;

  UPDATE recipes SET status = 'archived', is_default = false 
  WHERE product_id = v_rabri_prod AND id <> v_rabri_rec;

  DELETE FROM recipe_items WHERE recipe_id = v_rabri_rec;

  INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES
    (v_rabri_rec, '10000000-0000-0000-0000-000000000001', 15, 'litre', 1),
    (v_rabri_rec, '10000000-0000-0000-0000-000000000002', 1.5, 'kg', 2),
    (v_rabri_rec, '10000000-0000-0000-0000-000000000003', 1.0, 'kg', 3),
    (v_rabri_rec, '10000000-0000-0000-0000-000000000004', 0.2, 'kg', 4),
    (v_rabri_rec, '10000000-0000-0000-0000-000000000005', 0.1, 'kg', 5),
    (v_rabri_rec, '10000000-0000-0000-0000-000000000011', 100, 'piece', 6),
    (v_rabri_rec, '10000000-0000-0000-0000-000000000012', 100, 'piece', 7)
  ON CONFLICT DO NOTHING;

  -- 3. Premium Kulfi Standard Recipe (100 pcs)
  SELECT id INTO v_prem_rec FROM recipes WHERE product_id = v_prem_prod AND version_number = 1 LIMIT 1;
  IF v_prem_rec IS NULL THEN
    v_prem_rec := '20000000-0000-0000-0000-000000000003';
    INSERT INTO recipes (id, product_id, version_number, name, standard_output_pieces, expected_yield_pieces, status, is_default, default_overheads)
    VALUES (v_prem_rec, v_prem_prod, 1, 'Standard Premium 100 pcs', 100, 100, 'active', true, '{"gas":90,"direct_labour":100,"electricity":40,"transport":15,"other":15}'::jsonb);
  ELSE
    UPDATE recipes SET 
      name = 'Standard Premium 100 pcs',
      standard_output_pieces = 100,
      expected_yield_pieces = 100,
      status = 'active',
      is_default = true,
      default_overheads = '{"gas":90,"direct_labour":100,"electricity":40,"transport":15,"other":15}'::jsonb
    WHERE id = v_prem_rec;
  END IF;

  UPDATE recipes SET status = 'archived', is_default = false 
  WHERE product_id = v_prem_prod AND id <> v_prem_rec;

  DELETE FROM recipe_items WHERE recipe_id = v_prem_rec;

  INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES
    (v_prem_rec, '10000000-0000-0000-0000-000000000001', 20, 'litre', 1),
    (v_prem_rec, '10000000-0000-0000-0000-000000000002', 2.0, 'kg', 2),
    (v_prem_rec, '10000000-0000-0000-0000-000000000003', 1.5, 'kg', 3),
    (v_prem_rec, '10000000-0000-0000-0000-000000000004', 0.3, 'kg', 4),
    (v_prem_rec, '10000000-0000-0000-0000-000000000005', 0.2, 'kg', 5),
    (v_prem_rec, '10000000-0000-0000-0000-000000000006', 0.3, 'kg', 6),
    (v_prem_rec, '10000000-0000-0000-0000-000000000009', 2, 'g', 7),
    (v_prem_rec, '10000000-0000-0000-0000-000000000011', 100, 'piece', 8),
    (v_prem_rec, '10000000-0000-0000-0000-000000000012', 100, 'piece', 9)
  ON CONFLICT DO NOTHING;
END $$;

-- 8.10 Standard Commercial LPG Cylinders
INSERT INTO lpg_cylinders (id, cylinder_code, cylinder_type, rated_gas_capacity, tare_weight, full_gross_weight, current_gross_weight, calculated_remaining_gas, remaining_percentage, status, is_active)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'LPG-01', 'commercial_19kg', 19.00, 15.20, 34.20, 34.20, 19.00, 100.00, 'in_use', true),
  ('30000000-0000-0000-0000-000000000002', 'LPG-02', 'commercial_19kg', 19.00, 15.40, 34.40, 34.40, 19.00, 100.00, 'full', true),
  ('30000000-0000-0000-0000-000000000003', 'LPG-03', 'commercial_19kg', 19.00, 15.10, 34.10, 34.10, 19.00, 100.00, 'full', true)
ON CONFLICT (cylinder_code) DO NOTHING;

-- ============================================================================
-- 9. RELOAD SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
