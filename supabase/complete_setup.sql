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
  track_inventory BOOLEAN NOT NULL DEFAULT true,
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
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT true;
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
  movement_type TEXT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  reference_table TEXT,
  lot_id UUID,
  unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  total_value_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  reversal_of_movement_id UUID REFERENCES raw_material_movements(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE raw_material_movements DROP CONSTRAINT IF EXISTS raw_material_movements_movement_type_check;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS source_location TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS destination_location TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS reference_table TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS lot_id UUID;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS total_value_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS reversal_of_movement_id UUID REFERENCES raw_material_movements(id) ON DELETE SET NULL;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE raw_material_movements ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2.19.1 Material Purchases Header Table
CREATE TABLE IF NOT EXISTS material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number TEXT UNIQUE NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (credit_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  bill_image_url TEXT,
  notes TEXT,
  idempotency_key UUID UNIQUE,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('draft', 'received', 'cancelled', 'reversed')),
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.19.2 Material Purchase Items Table
CREATE TABLE IF NOT EXISTS material_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES material_purchases(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  purchased_quantity NUMERIC(12,3) NOT NULL CHECK (purchased_quantity > 0),
  purchase_unit TEXT NOT NULL,
  free_quantity NUMERIC(12,3) NOT NULL DEFAULT 0.000 CHECK (free_quantity >= 0),
  total_received_quantity NUMERIC(12,3) NOT NULL CHECK (total_received_quantity > 0),
  base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0),
  base_unit TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  item_price NUMERIC(12,2) NOT NULL CHECK (item_price >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
  tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
  allocated_charge NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (allocated_charge >= 0),
  net_item_cost NUMERIC(12,2) NOT NULL CHECK (net_item_cost >= 0),
  unit_acquisition_cost NUMERIC(12,4) NOT NULL CHECK (unit_acquisition_cost >= 0),
  lot_number TEXT,
  manufacturing_date DATE,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.19.3 Inventory Lots
CREATE TABLE IF NOT EXISTS inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  purchase_item_id UUID REFERENCES material_purchase_items(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  initial_quantity NUMERIC(12,3) NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity NUMERIC(12,3) NOT NULL CHECK (remaining_quantity >= 0),
  base_unit TEXT NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  manufacturing_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.19.4 Physical Stock Counts
CREATE TABLE IF NOT EXISTS physical_stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_number TEXT UNIQUE NOT NULL,
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  counted_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physical_stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES physical_stock_counts(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  app_stock NUMERIC(12,3) NOT NULL,
  physical_stock NUMERIC(12,3) NOT NULL CHECK (physical_stock >= 0),
  difference_quantity NUMERIC(12,3) NOT NULL,
  base_unit TEXT NOT NULL,
  unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  difference_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.19.5 Inventory Wastage & Internal Use
CREATE TABLE IF NOT EXISTS inventory_wastage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wastage_number TEXT UNIQUE NOT NULL,
  wastage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  base_unit TEXT NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  total_loss_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  wastage_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  photo_url TEXT,
  recorded_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.19.6 Supplier Returns
CREATE TABLE IF NOT EXISTS supplier_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT UNIQUE NOT NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES material_purchases(id) ON DELETE SET NULL,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  returned_quantity NUMERIC(12,3) NOT NULL CHECK (returned_quantity > 0),
  base_unit TEXT NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  total_refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  actual_refund_received NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.19.7 Reorder Shopping List
CREATE TABLE IF NOT EXISTS reorder_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID UNIQUE NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  suggested_quantity NUMERIC(12,3) NOT NULL CHECK (suggested_quantity > 0),
  base_unit TEXT NOT NULL,
  estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  notes TEXT,
  is_purchased BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS current_place TEXT;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS last_movement_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE lpg_cylinders ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.lpg_cylinders ALTER COLUMN tare_weight DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.lpg_cylinders ALTER COLUMN full_gross_weight DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.lpg_cylinders ALTER COLUMN current_gross_weight DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.lpg_cylinders ALTER COLUMN cylinder_type DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2.21 LPG Cylinder Movements Register (Chronological Ledger)
CREATE TABLE IF NOT EXISTS public.lpg_cylinder_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cylinder_id UUID NOT NULL REFERENCES public.lpg_cylinders(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'cylinder_added', 'connected', 'empty_removed', 'refill_sent', 'refill_received', 'correction'
  )),
  movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  place TEXT,
  connected_at TIMESTAMPTZ,
  empty_removed_at TIMESTAMPTZ,
  running_duration_hours NUMERIC(10,2),
  running_duration_display TEXT,
  supplier_name TEXT,
  bill_number TEXT,
  notes TEXT,
  corrected_from_movement_id UUID REFERENCES public.lpg_cylinder_movements(id) ON DELETE SET NULL,
  idempotency_key UUID UNIQUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historical LPG Cylinder Reading Logs (Preserved)
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
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS remaining_gas_kg NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS gas_consumed_kg NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES production_batches(id) ON DELETE SET NULL;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE lpg_cylinder_readings ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2.22 Expense Heads (Master Data)
CREATE TABLE IF NOT EXISTS expense_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  expense_group TEXT NOT NULL CHECK (expense_group IN ('monthly_fixed', 'variable_production')),
  calculation_mode TEXT NOT NULL CHECK (calculation_mode IN ('manual', 'automatic')),
  default_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (default_amount >= 0),
  due_day INTEGER NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 31),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.23 Expenses (Operational Transactions)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category expense_category NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method payment_method NOT NULL DEFAULT 'cash',
  vendor_name TEXT,
  paid_to TEXT,
  bill_image_path TEXT,
  bill_url TEXT,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided', 'pending', 'paid')),
  void_reason TEXT,
  expense_head_id UUID REFERENCES expense_heads(id) ON DELETE SET NULL,
  expense_month TEXT, -- Format: 'YYYY-MM', e.g. '2026-09'
  due_date DATE,
  corrected_from_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  is_monthly_fixed BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_to TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bill_image_path TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bill_url TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_head_id UUID REFERENCES expense_heads(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_month TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS corrected_from_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_monthly_fixed BOOLEAN NOT NULL DEFAULT false;

-- 2.24 Daily Closings
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

-- 4.3 Raw Material Stock Canonical View
CREATE OR REPLACE VIEW public.current_raw_material_stock AS
SELECT 
  i.id,
  i.id AS ingredient_id,
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
  i.current_rate AS latest_purchase_rate,
  i.rate_unit,
  i.preferred_supplier_id,
  i.preferred_supplier_name,
  i.storage_location,
  i.track_expiry,
  i.track_lots,
  i.track_inventory,
  i.is_active,
  COALESCE(SUM(rmm.quantity), 0) AS available_quantity,
  COALESCE(SUM(rmm.quantity), 0) AS current_stock,
  COALESCE(SUM(rmm.quantity), 0) AS available_base_quantity,
  (COALESCE(SUM(rmm.quantity), 0) * COALESCE(i.current_rate, 0)) AS stock_value,
  (COALESCE(SUM(rmm.quantity), 0) * COALESCE(i.current_rate, 0)) AS total_value,
  CASE 
    WHEN COALESCE(SUM(rmm.quantity), 0) <= 0 THEN 'out_of_stock'
    WHEN COALESCE(SUM(rmm.quantity), 0) <= i.min_stock_level THEN 'low_stock'
    ELSE 'adequate'
  END AS stock_status
FROM ingredients i
LEFT JOIN raw_material_movements rmm ON i.id = rmm.ingredient_id
GROUP BY i.id;

CREATE OR REPLACE VIEW public.v_raw_material_stock AS
SELECT * FROM public.current_raw_material_stock;

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

-- ----------------------------------------------------------------------------
-- 6.1 Security & Role Helpers
-- ----------------------------------------------------------------------------

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


-- ----------------------------------------------------------------------------
-- 6.2 Production & Recipe RPCs
-- ----------------------------------------------------------------------------

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
        'production_completed',
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

CREATE OR REPLACE FUNCTION complete_production_batch(
  p_batch_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_total_saleable INTEGER := 0;
  v_total_cost NUMERIC(12,2) := 0;
BEGIN
  -- Validate Batch
  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found';
  END IF;

  IF v_batch.status = 'completed' THEN
    RAISE EXCEPTION 'Batch is already completed';
  END IF;

  IF v_batch.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete a cancelled batch';
  END IF;

  -- Ensure Locations exist
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');

  -- Process Items
  FOR v_item IN SELECT * FROM production_items WHERE batch_id = p_batch_id FOR UPDATE LOOP
    IF v_item.produced_quantity < 0 OR v_item.damaged_quantity < 0 THEN
      RAISE EXCEPTION 'Quantities cannot be negative';
    END IF;
    IF v_item.damaged_quantity > v_item.produced_quantity THEN
      RAISE EXCEPTION 'Damaged quantity cannot exceed produced quantity';
    END IF;

    -- Update calculated saleable quantity
    UPDATE production_items
    SET saleable_quantity = v_item.produced_quantity - v_item.damaged_quantity,
        unit_production_cost = CASE WHEN (v_item.produced_quantity - v_item.damaged_quantity) > 0 
          THEN ROUND(v_item.allocated_ingredient_cost / (v_item.produced_quantity - v_item.damaged_quantity), 2)
          ELSE 0.00 END
    WHERE id = v_item.id;

    -- Create stock movement for saleable stock into Main Freezer
    IF (v_item.produced_quantity - v_item.damaged_quantity) > 0 THEN
      INSERT INTO stock_movements (
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
        v_item.product_id,
        v_prod_loc_id,
        v_freezer_loc_id,
        v_item.produced_quantity - v_item.damaged_quantity,
        'production_completed',
        'production_batches',
        p_batch_id,
        'Batch completed: ' || v_batch.batch_number,
        p_user_id
      );
    END IF;

    -- If damaged during production, record to damaged stock location
    IF v_item.damaged_quantity > 0 THEN
      INSERT INTO stock_movements (
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
        v_item.product_id,
        v_prod_loc_id,
        get_or_create_stock_location('damaged', NULL, 'Damaged Stock'),
        v_item.damaged_quantity,
        'damaged',
        'production_batches',
        p_batch_id,
        'Production wastage in batch: ' || v_batch.batch_number,
        p_user_id
      );
    END IF;

    v_total_saleable := v_total_saleable + (v_item.produced_quantity - v_item.damaged_quantity);
  END LOOP;

  -- Update Batch Status
  UPDATE production_batches
  SET status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_batch_id;

  -- Log Audit
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'production_batches',
    p_batch_id,
    'COMPLETE_PRODUCTION',
    row_to_json(v_batch)::jsonb,
    jsonb_build_object('status', 'completed', 'total_saleable', v_total_saleable),
    'Production batch completed and moved to freezer',
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'total_saleable', v_total_saleable);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE OR REPLACE FUNCTION complete_production_with_raw_materials_transaction(
  p_batch_id UUID,
  p_raw_materials JSONB,
  p_allow_emergency_override BOOLEAN DEFAULT false,
  p_override_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_mat JSONB;
  v_ing RECORD;
  v_used_qty NUMERIC(12,3);
  v_base_qty NUMERIC(12,3);
  v_unit_rate NUMERIC(12,4);
  v_item_cost NUMERIC(12,2);
  v_total_raw_cost NUMERIC(12,2) := 0.00;
BEGIN
  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Batch already completed.');
  END IF;

  -- Process Raw Material Deductions
  FOR v_mat IN SELECT * FROM jsonb_array_elements(p_raw_materials) LOOP
    IF (v_mat->>'ingredient_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT * INTO v_ing FROM ingredients WHERE id = (v_mat->>'ingredient_id')::UUID;
    ELSE
      SELECT * INTO v_ing FROM ingredients WHERE code ILIKE (v_mat->>'ingredient_id') LIMIT 1;
    END IF;

    IF NOT FOUND OR v_ing.id IS NULL THEN
      SELECT * INTO v_ing FROM ingredients WHERE code ILIKE (v_mat->>'ingredient_id') OR name_en ILIKE (v_mat->>'ingredient_id') LIMIT 1;
    END IF;

    IF NOT FOUND OR v_ing.id IS NULL THEN
      SELECT * INTO v_ing FROM ingredients LIMIT 1;
      IF NOT FOUND OR v_ing.id IS NULL THEN
        CONTINUE;
      END IF;
    END IF;

    v_used_qty := COALESCE((v_mat->>'quantity_used')::NUMERIC, 0);
    v_base_qty := v_used_qty * COALESCE(v_ing.conversion_factor, 1.0000);
    v_unit_rate := COALESCE(v_ing.current_rate, 0.00);
    v_item_cost := ROUND(v_base_qty * v_unit_rate, 2);
    v_total_raw_cost := v_total_raw_cost + v_item_cost;

    INSERT INTO raw_material_movements (
      ingredient_id, movement_date, source_location, destination_location,
      quantity, base_unit, movement_type, reference_type, reference_id,
      unit_cost_snapshot, total_value_snapshot, reason, performed_by
    ) VALUES (
      v_ing.id, NOW(), COALESCE(v_ing.storage_location, 'Kitchen Area'),
      'Production Batch ' || v_batch.batch_number,
      -v_base_qty, v_ing.base_unit, 'production_consumption',
      'production_batches', p_batch_id, v_unit_rate, v_item_cost,
      'Batch ' || v_batch.batch_number || ' raw material consumption', p_user_id
    );
  END LOOP;

  UPDATE production_batches
  SET status = 'completed',
      total_ingredient_cost = CASE WHEN total_ingredient_cost > 0 THEN total_ingredient_cost ELSE v_total_raw_cost END,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'total_ingredient_cost', v_total_raw_cost,
    'message', 'Production completed and raw materials deducted successfully.'
  );
END;
$$;

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

CREATE OR REPLACE FUNCTION delete_production_batch_transaction(
  p_batch_id UUID,
  p_reason TEXT DEFAULT 'Deleted by Owner',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_closing RECORD;
BEGIN
  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found.';
  END IF;

  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_batch.production_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_batch.production_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');

  IF v_batch.status = 'completed' THEN
    FOR v_item IN SELECT * FROM production_items WHERE batch_id = p_batch_id LOOP
      IF COALESCE(v_item.saleable_quantity, 0) > 0 THEN
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
          v_item.product_id,
          v_freezer_loc_id,
          v_prod_loc_id,
          v_item.saleable_quantity,
          'production_reversal',
          'production_batches',
          p_batch_id,
          'Reversal for deleted production batch ' || v_batch.batch_number || ': ' || COALESCE(p_reason, 'Deleted'),
          p_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- Unlink self-referencing pointers
  UPDATE production_batches SET correction_of_id = NULL WHERE correction_of_id = p_batch_id;
  UPDATE production_batches SET superseded_by_id = NULL WHERE superseded_by_id = p_batch_id;

  DELETE FROM production_batch_ingredients WHERE batch_id = p_batch_id;
  DELETE FROM production_items WHERE batch_id = p_batch_id;
  DELETE FROM production_batches WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'message', 'Production batch deleted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE OR REPLACE FUNCTION public.sync_completed_production_batches_stock()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_role text;
  v_production_id uuid;
  v_freezer_id uuid;
  v_item record;
  v_synced integer := 0;
  v_checked integer := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role::text INTO v_role
  FROM public.profiles
  WHERE id = v_caller_id AND is_active = true;

  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the Owner can synchronize stock'
      USING ERRCODE = '42501';
  END IF;

  v_production_id := public.get_or_create_stock_location(
    'production'::stock_location_type, NULL, 'Production Floor'
  );
  v_freezer_id := public.get_or_create_stock_location(
    'main_freezer'::stock_location_type, NULL, 'Main Cold Storage Freezer'
  );

  FOR v_item IN
    SELECT
      pb.id AS batch_id,
      pb.batch_number,
      pb.production_date,
      pb.completed_at,
      pi.product_id,
      pi.saleable_quantity
    FROM public.production_batches pb
    JOIN public.production_items pi ON pi.batch_id = pb.id
    WHERE pb.status = 'completed'
      AND COALESCE(pb.is_current_version, true) = true
      AND pi.saleable_quantity > 0
  LOOP
    v_checked := v_checked + 1;

    IF NOT EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.reference_table = 'production_batches'
        AND sm.reference_id = v_item.batch_id
        AND sm.product_id = v_item.product_id
        AND sm.movement_type = 'production_completed'
    ) THEN
      INSERT INTO public.stock_movements (
        movement_date, product_id, source_location_id, destination_location_id,
        quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        COALESCE(v_item.completed_at, v_item.production_date::timestamptz, now()),
        v_item.product_id, v_production_id, v_freezer_id,
        v_item.saleable_quantity, 'production_completed',
        'production_batches', v_item.batch_id,
        'Repaired missing stock movement for batch ' || v_item.batch_number,
        v_caller_id
      );
      v_synced := v_synced + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'synced_count', v_synced,
    'batches_checked', v_checked,
    'message', CASE WHEN v_synced = 0
      THEN 'Stock already synchronized—no changes required.'
      ELSE format('Synchronized %s missing stock movements.', v_synced)
    END,
    'message_hi', CASE WHEN v_synced = 0
      THEN 'स्टॉक पहले से सिंक है—कोई बदलाव आवश्यक नहीं।'
      ELSE format('%s छूटी हुई स्टॉक प्रविष्टियां जोड़ी गईं।', v_synced)
    END
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 6.3 Raw Material Inventory & Purchases
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_material_purchase_atomic(
  p_purchase_date DATE,
  p_supplier_id TEXT,
  p_invoice_number TEXT,
  p_payment_method TEXT,
  p_paid_amount NUMERIC,
  p_credit_amount NUMERIC,
  p_bill_image_url TEXT,
  p_notes TEXT,
  p_items JSONB,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_purchase_id UUID;
  v_purchase_number TEXT;
  v_item JSONB;
  v_ing RECORD;
  v_purchased_qty NUMERIC(12,3);
  v_free_qty NUMERIC(12,3);
  v_total_rec_qty NUMERIC(12,3);
  v_unit_price NUMERIC(12,2);
  v_item_price NUMERIC(12,2);
  v_discount NUMERIC(12,2);
  v_tax NUMERIC(12,2);
  v_charge NUMERIC(12,2);
  v_net_item_cost NUMERIC(12,2);
  v_unit_acq_cost NUMERIC(12,4);
  v_total_purchase_cost NUMERIC(12,2) := 0.00;
  v_supplier_uuid UUID := NULL;
  v_user_uuid UUID := NULL;
  v_ing_uuid UUID;
  v_existing_id UUID;
  v_balances JSONB := '[]'::JSONB;
  v_new_bal NUMERIC(12,3);
BEGIN
  -- Strict search path
  SET search_path = public, extensions, pg_temp;

  -- 1. Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, purchase_number, total_amount INTO v_existing_id, v_purchase_number, v_total_purchase_cost
    FROM public.material_purchases
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_duplicate', true,
        'purchase_id', v_existing_id,
        'purchase_number', v_purchase_number,
        'total_amount', v_total_purchase_cost,
        'message', 'खरीद पहले ही दर्ज की जा चुकी है (Idempotent replay)'
      );
    END IF;
  END IF;

  -- 2. Resolve User & Supplier
  IF auth.uid() IS NOT NULL THEN
    v_user_uuid := auth.uid();
  ELSIF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  IF p_supplier_id IS NOT NULL AND p_supplier_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supplier_uuid := p_supplier_id::UUID;
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_supplier_uuid) THEN
      v_supplier_uuid := NULL;
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one purchase item is required (कम से कम एक सामग्री आवश्यक है)';
  END IF;

  -- 3. Validate items & calculate total cost
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'ingredient_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_ing_uuid := (v_item->>'ingredient_id')::UUID;
    ELSE
      SELECT id INTO v_ing_uuid FROM public.ingredients 
      WHERE id::TEXT = (v_item->>'ingredient_id') OR code ILIKE (v_item->>'ingredient_id') OR name_en ILIKE (v_item->>'ingredient_id')
      LIMIT 1;
    END IF;

    IF v_ing_uuid IS NULL THEN
      RAISE EXCEPTION 'Ingredient % not found in database', COALESCE(v_item->>'ingredient_id', 'Unknown');
    END IF;

    SELECT * INTO v_ing FROM public.ingredients WHERE id = v_ing_uuid;
    IF v_ing IS NULL THEN
      RAISE EXCEPTION 'Ingredient with ID % not found', v_ing_uuid;
    END IF;

    IF v_ing.is_active = false THEN
      RAISE EXCEPTION 'Ingredient % (%) is deactivated and cannot be purchased', v_ing.name_hi, v_ing.name_en;
    END IF;

    v_purchased_qty := COALESCE((v_item->>'purchased_quantity')::NUMERIC, 0);
    IF v_purchased_qty <= 0 THEN
      RAISE EXCEPTION 'Purchased quantity must be greater than 0 for %', v_ing.name_hi;
    END IF;

    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Unit price cannot be negative for %', v_ing.name_hi;
    END IF;

    v_free_qty := COALESCE((v_item->>'free_quantity')::NUMERIC, 0);
    IF v_free_qty < 0 THEN v_free_qty := 0; END IF;

    v_discount := COALESCE((v_item->>'discount')::NUMERIC, (v_item->>'discount_amount')::NUMERIC, 0);
    v_tax := COALESCE((v_item->>'tax')::NUMERIC, (v_item->>'tax_amount')::NUMERIC, 0);
    v_charge := COALESCE((v_item->>'allocated_charge')::NUMERIC, 0);
    v_item_price := ROUND(v_purchased_qty * v_unit_price, 2);
    v_net_item_cost := v_item_price - v_discount + v_tax + v_charge;
    v_total_purchase_cost := v_total_purchase_cost + v_net_item_cost;
  END LOOP;

  v_purchase_number := 'PUR-' || TO_CHAR(COALESCE(p_purchase_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

  -- 4. Insert Purchase Header
  INSERT INTO public.material_purchases (
    purchase_number, purchase_date, supplier_id, invoice_number, payment_method,
    total_amount, paid_amount, credit_amount, status, bill_image_url, notes, idempotency_key, created_by
  ) VALUES (
    v_purchase_number,
    COALESCE(p_purchase_date, CURRENT_DATE),
    v_supplier_uuid,
    p_invoice_number,
    COALESCE(p_payment_method, 'cash'),
    v_total_purchase_cost,
    COALESCE(p_paid_amount, 0),
    COALESCE(p_credit_amount, 0),
    'received',
    p_bill_image_url,
    p_notes,
    p_idempotency_key,
    v_user_uuid
  ) RETURNING id INTO v_purchase_id;

  -- 5. Insert Items & Movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'ingredient_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_ing_uuid := (v_item->>'ingredient_id')::UUID;
    ELSE
      SELECT id INTO v_ing_uuid FROM public.ingredients 
      WHERE id::TEXT = (v_item->>'ingredient_id') OR code ILIKE (v_item->>'ingredient_id') OR name_en ILIKE (v_item->>'ingredient_id')
      LIMIT 1;
    END IF;

    SELECT * INTO v_ing FROM public.ingredients WHERE id = v_ing_uuid;
    
    v_purchased_qty := COALESCE((v_item->>'purchased_quantity')::NUMERIC, 0);
    v_free_qty := COALESCE((v_item->>'free_quantity')::NUMERIC, 0);
    v_total_rec_qty := v_purchased_qty + v_free_qty;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_discount := COALESCE((v_item->>'discount')::NUMERIC, (v_item->>'discount_amount')::NUMERIC, 0);
    v_tax := COALESCE((v_item->>'tax')::NUMERIC, (v_item->>'tax_amount')::NUMERIC, 0);
    v_charge := COALESCE((v_item->>'allocated_charge')::NUMERIC, 0);
    v_item_price := ROUND(v_purchased_qty * v_unit_price, 2);
    v_net_item_cost := v_item_price - v_discount + v_tax + v_charge;
    v_unit_acq_cost := CASE WHEN v_total_rec_qty > 0 THEN ROUND(v_net_item_cost / v_total_rec_qty, 4) ELSE v_unit_price END;

    INSERT INTO public.material_purchase_items (
      purchase_id, ingredient_id, purchased_quantity, purchase_unit,
      free_quantity, total_received_quantity, base_quantity, base_unit,
      unit_price, item_price, discount, tax, allocated_charge,
      net_item_cost, unit_acquisition_cost, lot_number, manufacturing_date, expiry_date
    ) VALUES (
      v_purchase_id, v_ing_uuid, v_purchased_qty, COALESCE(v_item->>'purchase_unit', v_ing.base_unit),
      v_free_qty, v_total_rec_qty, v_total_rec_qty, v_ing.base_unit,
      v_unit_price, v_item_price, v_discount, v_tax, v_charge,
      v_net_item_cost, v_unit_acq_cost, v_item->>'lot_number',
      NULLIF(v_item->>'manufacturing_date', '')::DATE,
      NULLIF(v_item->>'expiry_date', '')::DATE
    );

    -- Stock In Movement
    INSERT INTO public.raw_material_movements (
      ingredient_id, movement_type, quantity, base_unit,
      unit_cost_snapshot, total_value_snapshot, reference_table, reference_id,
      movement_date, source_location, destination_location, reason, created_by
    ) VALUES (
      v_ing_uuid, 'purchase_received', v_total_rec_qty, v_ing.base_unit,
      v_unit_acq_cost, v_net_item_cost, 'material_purchases', v_purchase_id,
      COALESCE(p_purchase_date, CURRENT_DATE), 'Supplier', 'Main Store',
      'Material purchase: ' || v_purchase_number, v_user_uuid
    );

    -- Update current rate
    UPDATE public.ingredients 
    SET current_rate = v_unit_price, updated_at = NOW()
    WHERE id = v_ing_uuid;

    SELECT COALESCE(SUM(quantity), 0) INTO v_new_bal
    FROM public.raw_material_movements
    WHERE ingredient_id = v_ing_uuid;

    v_balances := v_balances || jsonb_build_object(
      'ingredient_id', v_ing_uuid,
      'name_hi', v_ing.name_hi,
      'name_en', v_ing.name_en,
      'new_balance', v_new_bal,
      'base_unit', v_ing.base_unit
    );
  END LOOP;

  -- 6. Linked Expense
  IF COALESCE(p_paid_amount, 0) > 0 THEN
    INSERT INTO public.expenses (
      expense_date, category, amount, payment_method, paid_to, description, bill_url, created_by
    ) VALUES (
      COALESCE(p_purchase_date, CURRENT_DATE), 'raw_materials', p_paid_amount,
      CASE WHEN p_payment_method = 'credit' THEN 'cash' ELSE p_payment_method END,
      COALESCE((SELECT name FROM public.suppliers WHERE id = v_supplier_uuid), 'Material Supplier'),
      'Raw material purchase ' || v_purchase_number, p_bill_image_url, v_user_uuid
    );
  END IF;

  -- 7. Audit log
  INSERT INTO public.audit_logs (
    table_name, record_id, action, new_data, reason, performed_by
  ) VALUES (
    'material_purchases', v_purchase_id, 'CREATE_MATERIAL_PURCHASE',
    jsonb_build_object('purchase_number', v_purchase_number, 'total_amount', v_total_purchase_cost, 'items_count', jsonb_array_length(p_items)),
    'Received raw material purchase ' || v_purchase_number, v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_number,
    'total_amount', v_total_purchase_cost,
    'balances', v_balances,
    'message', 'सामग्री खरीद सफलतापूर्वक दर्ज की गई व स्टॉक अपडेट हुआ'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backward compatibility alias
CREATE OR REPLACE FUNCTION public.confirm_material_purchase_transaction(
  p_purchase_date DATE,
  p_supplier_id TEXT,
  p_invoice_number TEXT,
  p_payment_method TEXT,
  p_paid_amount NUMERIC,
  p_credit_amount NUMERIC,
  p_bill_image_url TEXT,
  p_notes TEXT,
  p_items JSONB,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
  RETURN public.confirm_material_purchase_atomic(
    p_purchase_date, p_supplier_id, p_invoice_number, p_payment_method,
    p_paid_amount, p_credit_amount, p_bill_image_url, p_notes,
    p_items, NULL, p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reverse_material_purchase_transaction(
  p_purchase_id UUID,
  p_reason TEXT DEFAULT 'Purchase cancelled/reversed',
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_purch RECORD;
  v_item RECORD;
  v_user_uuid UUID := NULL;
  v_qty NUMERIC(12,3);
  v_cost NUMERIC(12,2);
  v_current_stock NUMERIC(12,3);
  v_item_count INTEGER := 0;
BEGIN
  SET search_path = public, extensions, pg_temp;

  IF auth.uid() IS NOT NULL THEN
    v_user_uuid := auth.uid();
  ELSIF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  SELECT * INTO v_purch FROM public.material_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material purchase with ID % not found', p_purchase_id;
  END IF;

  IF v_purch.status = 'cancelled' OR v_purch.status = 'reversed' THEN
    RAISE EXCEPTION 'Purchase % is already cancelled/reversed', v_purch.purchase_number;
  END IF;

  -- 1. Validate that reversal will not cause stock to drop below zero
  FOR v_item IN SELECT * FROM public.material_purchase_items WHERE purchase_id = p_purchase_id LOOP
    v_qty := COALESCE(v_item.purchased_quantity, 0) + COALESCE(v_item.free_quantity, 0);
    IF v_qty > 0 THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock
      FROM public.raw_material_movements
      WHERE ingredient_id = v_item.ingredient_id;

      IF (v_current_stock - v_qty) < -0.001 THEN
        RAISE EXCEPTION 'Cannot reverse purchase %: stock for % would become negative (% - % = %). Perform physical stock correction first.',
          v_purch.purchase_number,
          (SELECT name_hi FROM public.ingredients WHERE id = v_item.ingredient_id),
          v_current_stock,
          v_qty,
          (v_current_stock - v_qty);
      END IF;
    END IF;
  END LOOP;

  -- 2. Update purchase status
  UPDATE public.material_purchases
  SET status = 'cancelled',
      notes = COALESCE(notes, '') || ' [Cancelled: ' || COALESCE(p_reason, 'No reason given') || ']',
      updated_at = NOW()
  WHERE id = p_purchase_id;

  -- 3. Reverse stock movements for each item
  FOR v_item IN SELECT * FROM public.material_purchase_items WHERE purchase_id = p_purchase_id LOOP
    v_qty := COALESCE(v_item.purchased_quantity, 0) + COALESCE(v_item.free_quantity, 0);
    v_cost := COALESCE(v_item.net_item_cost, v_item.item_price, v_qty * COALESCE(v_item.unit_price, 0));

    IF v_qty > 0 THEN
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
        created_by
      ) VALUES (
        v_item.ingredient_id,
        'purchase_reversal',
        -ABS(v_qty),
        COALESCE(v_item.purchase_unit, (SELECT base_unit FROM public.ingredients WHERE id = v_item.ingredient_id), 'kg'),
        COALESCE(v_item.unit_price, 0.00),
        -ABS(v_cost),
        'material_purchases',
        p_purchase_id,
        CURRENT_DATE,
        'Main Store',
        'Supplier',
        COALESCE(p_reason, 'Material purchase reversed: ' || v_purch.purchase_number),
        v_user_uuid
      );
      v_item_count := v_item_count + 1;
    END IF;
  END LOOP;

  -- 4. Audit log
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
    jsonb_build_object('status', v_purch.status, 'purchase_number', v_purch.purchase_number),
    jsonb_build_object('status', 'cancelled', 'reason', p_reason, 'items_reversed', v_item_count),
    COALESCE(p_reason, 'Material purchase reversed: ' || v_purch.purchase_number),
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', p_purchase_id,
    'purchase_number', v_purch.purchase_number,
    'message', 'खरीद सफलतापूर्वक रिवर्स कर दी गई व स्टॉक घटा दिया गया'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    SELECT * INTO v_ing FROM ingredients WHERE code ILIKE p_ingredient_id::TEXT LIMIT 1;
  END IF;

  IF NOT FOUND OR v_ing.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ingredient_not_found',
      'message', 'Ingredient not found in database. Please refresh your inventory list.'
    );
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock 
  FROM raw_material_movements 
  WHERE ingredient_id = v_ing.id;

  v_diff := p_new_quantity - v_current_stock;
  IF v_diff = 0 THEN
    RETURN jsonb_build_object('success', true, 'difference', 0, 'message', 'Stock count already matches.');
  END IF;

  INSERT INTO raw_material_movements (
    ingredient_id, movement_date, source_location, destination_location,
    quantity, base_unit, movement_type, unit_cost_snapshot, total_value_snapshot,
    reason, performed_by
  ) VALUES (
    v_ing.id, NOW(), 'Physical Stock Count', COALESCE(v_ing.storage_location, 'Kitchen Area'),
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
    RETURN jsonb_build_object('success', true, 'deleted', true, 'message', 'Ingredient does not exist or has already been removed.');
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

CREATE OR REPLACE FUNCTION get_available_raw_material_stock(p_ingredient_id UUID)
RETURNS NUMERIC(12,3)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avail NUMERIC(12,3) := 0.000;
BEGIN
  SELECT GREATEST(0, COALESCE(SUM(quantity), 0)) INTO v_avail
  FROM raw_material_movements
  WHERE ingredient_id = p_ingredient_id;
  RETURN COALESCE(v_avail, 0.000);
END;
$$;

CREATE OR REPLACE FUNCTION approve_physical_stock_count_transaction(
  p_count_id UUID,
  p_approved_by TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_count RECORD;
  v_item RECORD;
  v_user_uuid UUID := NULL;
  v_discrepancy NUMERIC;
BEGIN
  IF p_approved_by IS NOT NULL AND p_approved_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_approved_by::UUID;
  END IF;

  SELECT * INTO v_count FROM physical_stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Physical stock count record not found';
  END IF;

  IF v_count.status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Stock count already approved.');
  END IF;

  -- 1. Mark approved
  UPDATE physical_stock_counts
  SET status = 'approved',
      approved_by = v_user_uuid,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_count_id;

  -- 2. Reconcile differences
  FOR v_item IN SELECT * FROM physical_stock_count_items WHERE physical_stock_count_id = p_count_id LOOP
    v_discrepancy := COALESCE(v_item.discrepancy, v_item.physical_stock - v_item.system_stock);

    IF v_discrepancy <> 0 THEN
      INSERT INTO raw_material_movements (
        ingredient_id,
        movement_type,
        quantity,
        reference_table,
        reference_id,
        movement_date,
        source_location,
        notes,
        created_by
      ) VALUES (
        v_item.ingredient_id,
        'stock_audit_reconciliation',
        v_discrepancy,
        'physical_stock_counts',
        p_count_id,
        CURRENT_DATE,
        'Main Store',
        COALESCE(v_item.reason, 'Physical audit adjustment: ' || v_discrepancy),
        v_user_uuid
      );
    END IF;
  END LOOP;

  -- 3. Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'physical_stock_counts',
    p_count_id,
    'APPROVE_STOCK_COUNT',
    row_to_json(v_count)::jsonb,
    jsonb_build_object('status', 'approved', 'approved_by', v_user_uuid),
    'Physical stock count audit approved',
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'count_id', p_count_id,
    'message', 'स्टॉक सत्यापन सफलतापूर्वक स्वीकृत हुआ'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 6.4 Cold Storage & Freezer Stock
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_freezer_balances()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(p.id::text, COALESCE(cls.quantity, 0))
  INTO v_result
  FROM public.products p
  LEFT JOIN public.current_location_stock cls
    ON cls.product_id = p.id
    AND cls.location_id = 'a0000000-0000-0000-0000-000000000002'::uuid;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_available_freezer_stock(p_product_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_qty NUMERIC;
BEGIN
  SELECT quantity INTO v_qty
  FROM public.current_location_stock
  WHERE location_id = 'a0000000-0000-0000-0000-000000000002'::uuid
    AND product_id = p_product_id;
  
  RETURN COALESCE(v_qty::integer, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id UUID,
  p_location_id UUID,
  p_quantity INTEGER,
  p_movement_type stock_movement_type,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_movement_id UUID;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required for manual stock adjustment';
  END IF;

  INSERT INTO stock_movements (
    product_id,
    destination_location_id,
    quantity,
    movement_type,
    notes,
    created_by
  ) VALUES (
    p_product_id,
    p_location_id,
    p_quantity,
    p_movement_type,
    p_reason,
    p_user_id
  ) RETURNING id INTO v_movement_id;

  INSERT INTO audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'stock_movements',
    v_movement_id,
    'ADJUST_STOCK',
    jsonb_build_object('product_id', p_product_id, 'location_id', p_location_id, 'quantity', p_quantity),
    p_reason,
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'movement_id', v_movement_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.adjust_freezer_stock_transaction(
  p_product_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT DEFAULT 'Manual Adjustment',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
  RETURN public.reconcile_freezer_stock_transaction(
    jsonb_build_object(p_product_id::text, p_new_quantity),
    COALESCE(p_reason, 'Manual Adjustment'),
    NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reconcile_freezer_stock_transaction(
  p_counts jsonb,
  p_reason text,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_role text;
  v_freezer_id uuid;
  v_adjustment_id uuid;
  v_operation_id uuid := COALESCE(p_idempotency_key, uuid_generate_v4());
  v_product_id uuid;
  v_value text;
  v_current integer;
  v_target integer;
  v_difference integer;
  v_old_balances jsonb := '{}'::jsonb;
  v_new_balances jsonb := '{}'::jsonb;
  v_adjustments jsonb := '[]'::jsonb;
  v_adjusted_count integer := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role::text INTO v_role
  FROM public.profiles
  WHERE id = v_caller_id AND is_active = true;

  IF v_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only the Owner can reconcile freezer stock'
      USING ERRCODE = '42501';
  END IF;

  IF p_counts IS NULL OR jsonb_typeof(p_counts) <> 'object' THEN
    RAISE EXCEPTION 'p_counts must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reconciliation reason is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE record_id = p_idempotency_key
      AND action = 'OWNER_STOCK_RECONCILIATION'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'This reconciliation was already applied',
      'total_adjusted_products', 0,
      'old_balances', '{}'::jsonb,
      'new_balances', public.get_freezer_balances(),
      'adjustments', '[]'::jsonb
    );
  END IF;

  v_freezer_id := public.get_or_create_stock_location(
    'main_freezer'::stock_location_type, NULL, 'Main Cold Storage Freezer'
  );
  v_adjustment_id := public.get_or_create_stock_location(
    'damaged'::stock_location_type, NULL, 'Inventory Adjustment'
  );

  FOR v_product_id, v_value IN
    SELECT key::uuid, value
    FROM jsonb_each_text(p_counts)
  LOOP
    IF v_value !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Invalid physical count for product %', v_product_id
        USING ERRCODE = '22023';
    END IF;

    v_target := v_value::integer;

    PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % does not exist', v_product_id
        USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(SUM(
      CASE
        WHEN destination_location_id = v_freezer_id THEN quantity
        WHEN source_location_id = v_freezer_id THEN -quantity
        ELSE 0
      END
    ), 0)::integer
    INTO v_current
    FROM public.stock_movements
    WHERE product_id = v_product_id
      AND (source_location_id = v_freezer_id OR destination_location_id = v_freezer_id);

    v_difference := v_target - v_current;
    v_old_balances := jsonb_set(v_old_balances, ARRAY[v_product_id::text], to_jsonb(v_current), true);
    v_new_balances := jsonb_set(v_new_balances, ARRAY[v_product_id::text], to_jsonb(v_target), true);

    IF v_difference <> 0 THEN
      INSERT INTO public.stock_movements (
        movement_date, product_id, source_location_id, destination_location_id,
        quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        now(),
        v_product_id,
        CASE WHEN v_difference < 0 THEN v_freezer_id ELSE v_adjustment_id END,
        CASE WHEN v_difference < 0 THEN v_adjustment_id ELSE v_freezer_id END,
        abs(v_difference),
        'stock_correction'::stock_movement_type,
        'stock_reconciliations',
        v_operation_id,
        format('Physical stock reconciliation: %s -> %s. Reason: %s',
          v_current, v_target, btrim(p_reason)),
        v_caller_id
      );

      v_adjustments := v_adjustments || jsonb_build_array(jsonb_build_object(
        'product_id', v_product_id,
        'previous_quantity', v_current,
        'new_quantity', v_target,
        'difference', v_difference
      ));
      v_adjusted_count := v_adjusted_count + 1;
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (
    table_name, record_id, action, old_data, new_data,
    reason, performed_by, performed_at
  ) VALUES (
    'stock_reconciliations', v_operation_id, 'OWNER_STOCK_RECONCILIATION',
    v_old_balances,
    jsonb_build_object('counts', v_new_balances, 'adjustments', v_adjustments),
    btrim(p_reason), v_caller_id, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stock reconciliation completed successfully',
    'operation_id', v_operation_id,
    'total_adjusted_products', v_adjusted_count,
    'old_balances', v_old_balances,
    'new_balances', v_new_balances,
    'adjustments', v_adjustments
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 6.5 Seller Operations & Settlements
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION issue_seller_stock(
  p_seller_id UUID,
  p_cart_id UUID,
  p_issue_date DATE,
  p_items JSONB, -- Array of { product_id, issued_quantity }
  p_notes TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_issue_id UUID;
  v_issue_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_available_qty INTEGER;
  v_price RECORD;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_today_code TEXT;
  v_seq INTEGER;
BEGIN
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot create an empty stock issue. At least one product is required.';
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', p_seller_id);

  -- Generate readable issue number: IS-YYYYMMDD-001
  v_today_code := 'IS-' || TO_CHAR(COALESCE(p_issue_date, CURRENT_DATE), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_seq FROM seller_issues WHERE issue_number LIKE v_today_code || '%';
  v_issue_number := v_today_code || '-' || LPAD(v_seq::TEXT, 3, '0');

  -- Create Issue Header
  INSERT INTO seller_issues (
    issue_number,
    seller_id,
    cart_id,
    issue_date,
    status,
    issued_at,
    notes,
    created_by
  ) VALUES (
    v_issue_number,
    p_seller_id,
    p_cart_id,
    COALESCE(p_issue_date, CURRENT_DATE),
    'issued',
    NOW(),
    p_notes,
    p_user_id
  ) RETURNING id INTO v_issue_id;

  -- Process and Validate each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'issued_quantity')::INTEGER;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Issued quantity must be greater than zero';
    END IF;

    -- Validate Available Freezer Stock
    SELECT available_quantity INTO v_available_qty 
    FROM v_freezer_stock 
    WHERE product_id = v_product_id;

    IF v_available_qty IS NULL OR v_available_qty < v_quantity THEN
      RAISE EXCEPTION 'Insufficient freezer stock for product % (Available: %, Requested: %)', 
        v_product_id, COALESCE(v_available_qty, 0), v_quantity;
    END IF;

    -- Get Active Price and Commission Snapshot
    SELECT selling_price, commission_type, commission_value INTO v_price
    FROM product_prices
    WHERE product_id = v_product_id
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY effective_from DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active price configuration found for product %', v_product_id;
    END IF;

    -- Insert Issue Item with Snapshots
    INSERT INTO seller_issue_items (
      seller_issue_id,
      product_id,
      issued_quantity,
      unit_selling_price_snapshot,
      commission_type_snapshot,
      commission_value_snapshot
    ) VALUES (
      v_issue_id,
      v_product_id,
      v_quantity,
      v_price.selling_price,
      v_price.commission_type::TEXT,
      v_price.commission_value
    );

    -- Record Authoritative Stock Movement from Freezer to Seller
    INSERT INTO stock_movements (
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
      v_product_id,
      v_freezer_loc_id,
      v_seller_loc_id,
      v_quantity,
      'seller_issued',
      'seller_issues',
      v_issue_id,
      'Stock issue: ' || v_issue_number,
      p_user_id
    );
  END LOOP;

  -- Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'seller_issues',
    v_issue_id,
    'ISSUE_SELLER_STOCK',
    jsonb_build_object('issue_number', v_issue_number, 'seller_id', p_seller_id, 'items', p_items),
    'Stock issued to seller',
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'issue_id', v_issue_id, 'issue_number', v_issue_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE OR REPLACE FUNCTION delete_seller_issue_transaction(
  p_issue_id UUID,
  p_reason TEXT DEFAULT 'Deleted by Owner',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_issue RECORD;
  v_item RECORD;
  v_seller_loc_id UUID;
  v_freezer_loc_id UUID;
  v_closing RECORD;
  v_active_settlement RECORD;
BEGIN
  SELECT * INTO v_issue FROM seller_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock issue not found.';
  END IF;

  SELECT settlement_number INTO v_active_settlement
  FROM seller_settlements
  WHERE (seller_issue_id = p_issue_id OR issue_id = p_issue_id)
    AND status IN ('approved', 'pending_approval', 'draft')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot delete stock issue because an active settlement (%) is linked to it. Please delete the settlement first.', v_active_settlement.settlement_number;
  END IF;

  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_issue.issue_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_issue.issue_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_issue.seller_id, 'Seller Cart');

  IF v_issue.status = 'issued' THEN
    FOR v_item IN SELECT * FROM seller_issue_items WHERE seller_issue_id = p_issue_id LOOP
      IF COALESCE(v_item.issued_quantity, 0) > 0 THEN
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
          v_item.product_id,
          v_seller_loc_id,
          v_freezer_loc_id,
          v_item.issued_quantity,
          'issue_reversal',
          'seller_issues',
          p_issue_id,
          'Reversal for deleted stock issue ' || v_issue.issue_number || ': ' || COALESCE(p_reason, 'Deleted'),
          p_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- Clean up any inactive/superseded/cancelled settlement records
  DELETE FROM settlement_items WHERE settlement_id IN (
    SELECT id FROM seller_settlements WHERE seller_issue_id = p_issue_id OR issue_id = p_issue_id
  );
  DELETE FROM seller_settlements WHERE seller_issue_id = p_issue_id OR issue_id = p_issue_id;

  -- Unlink self-referencing correction chains
  UPDATE seller_issues SET correction_of_id = NULL WHERE correction_of_id = p_issue_id;
  UPDATE seller_issues SET superseded_by_id = NULL WHERE superseded_by_id = p_issue_id;

  DELETE FROM seller_issue_items WHERE seller_issue_id = p_issue_id;
  DELETE FROM seller_issues WHERE id = p_issue_id;

  RETURN jsonb_build_object('success', true, 'message', 'Stock issue deleted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION process_seller_settlement(
  p_seller_issue_id UUID,
  p_settlement_date DATE,
  p_items JSONB, -- Array of { issue_item_id, returned_qty, damaged_qty, comp_qty, damage_reason, comp_reason }
  p_cash NUMERIC(12,2),
  p_upi NUMERIC(12,2),
  p_credit NUMERIC(12,2),
  p_notes TEXT,
  p_is_approved_by_owner BOOLEAN,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_issue RECORD;
  v_settlement_id UUID;
  v_settlement_number TEXT;
  v_item JSONB;
  v_issue_item RECORD;
  v_returned INT;
  v_damaged INT;
  v_comp INT;
  v_sold INT;
  v_item_gross NUMERIC(12,2);
  v_item_commission NUMERIC(12,2);
  v_tot_gross NUMERIC(12,2) := 0.00;
  v_tot_commission NUMERIC(12,2) := 0.00;
  v_expected_collection NUMERIC(12,2) := 0.00;
  v_total_received NUMERIC(12,2) := 0.00;
  v_accounted_amount NUMERIC(12,2) := 0.00;
  v_diff NUMERIC(12,2) := 0.00;
  v_shortage NUMERIC(12,2) := 0.00;
  v_outstanding NUMERIC(12,2) := 0.00;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_damaged_loc_id UUID;
  v_comp_loc_id UUID;
  v_today_code TEXT;
  v_seq INT;
  v_status settlement_status;
BEGIN
  -- Validate Issue
  SELECT * INTO v_issue FROM seller_issues WHERE id = p_seller_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock issue not found';
  END IF;

  IF v_issue.status = 'settled' THEN
    RAISE EXCEPTION 'This issue is already fully settled';
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_issue.seller_id);
  v_damaged_loc_id := get_or_create_stock_location('damaged');
  v_comp_loc_id := get_or_create_stock_location('complimentary');

  -- Generate Settlement Number: ST-YYYYMMDD-001
  v_today_code := 'ST-' || TO_CHAR(COALESCE(p_settlement_date, CURRENT_DATE), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_seq FROM seller_settlements WHERE settlement_number LIKE v_today_code || '%';
  v_settlement_number := v_today_code || '-' || LPAD(v_seq::TEXT, 3, '0');

  v_status := CASE WHEN p_is_approved_by_owner THEN 'approved'::settlement_status ELSE 'pending_approval'::settlement_status END;

  -- Create Settlement Draft Header
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
    approved_at
  ) VALUES (
    v_settlement_number,
    p_seller_issue_id,
    v_issue.seller_id,
    COALESCE(p_settlement_date, CURRENT_DATE),
    v_status,
    COALESCE(p_cash, 0.00),
    COALESCE(p_upi, 0.00),
    COALESCE(p_credit, 0.00),
    0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
    p_notes,
    p_user_id,
    CASE WHEN p_is_approved_by_owner THEN p_user_id ELSE NULL END,
    NOW(),
    CASE WHEN p_is_approved_by_owner THEN NOW() ELSE NULL END
  ) RETURNING id INTO v_settlement_id;

  -- Process Items and Calculate Server-Side Totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_issue_item 
    FROM seller_issue_items 
    WHERE id = (v_item->>'issue_item_id')::UUID AND seller_issue_id = p_seller_issue_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Issue item % does not match issue %', (v_item->>'issue_item_id'), p_seller_issue_id;
    END IF;

    v_returned := COALESCE((v_item->>'returned_qty')::INT, 0);
    v_damaged := COALESCE((v_item->>'damaged_qty')::INT, 0);
    v_comp := COALESCE((v_item->>'comp_qty')::INT, 0);

    IF v_returned < 0 OR v_damaged < 0 OR v_comp < 0 THEN
      RAISE EXCEPTION 'Returned, damaged and complimentary quantities cannot be negative';
    END IF;

    IF (v_returned + v_damaged + v_comp) > v_issue_item.issued_quantity THEN
      RAISE EXCEPTION 'Total of return, damage, and complimentary (%) cannot exceed issued quantity (%) for product %',
        (v_returned + v_damaged + v_comp), v_issue_item.issued_quantity, v_issue_item.product_id;
    END IF;

    -- Require reasons if damage or complimentary is recorded
    IF v_damaged > 0 AND (v_item->>'damage_reason' IS NULL OR length(trim(v_item->>'damage_reason')) = 0) THEN
      RAISE EXCEPTION 'Damage reason is required when damaged quantity > 0';
    END IF;
    IF v_comp > 0 AND (v_item->>'comp_reason' IS NULL OR length(trim(v_item->>'comp_reason')) = 0) THEN
      RAISE EXCEPTION 'Complimentary reason is required when complimentary quantity > 0';
    END IF;

    -- Sold Quantity calculation
    v_sold := v_issue_item.issued_quantity - (v_returned + v_damaged + v_comp);
    v_item_gross := v_sold * v_issue_item.unit_selling_price_snapshot;

    -- Commission calculation
    IF v_issue_item.commission_type_snapshot = 'percentage' THEN
      v_item_commission := ROUND((v_item_gross * v_issue_item.commission_value_snapshot) / 100.0, 2);
    ELSE
      v_item_commission := v_sold * v_issue_item.commission_value_snapshot;
    END IF;

    v_tot_gross := v_tot_gross + v_item_gross;
    v_tot_commission := v_tot_commission + v_item_commission;

    -- Insert Settlement Item
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
      v_settlement_id,
      v_issue_item.id,
      v_issue_item.product_id,
      v_issue_item.issued_quantity,
      v_returned,
      v_damaged,
      v_comp,
      v_sold,
      v_issue_item.unit_selling_price_snapshot,
      v_item_gross,
      v_item_commission,
      v_item->>'damage_reason',
      v_item->>'comp_reason'
    );

    -- If approved immediately by Owner, commit stock movements
    IF p_is_approved_by_owner THEN
      -- Unsold returned stock moves back to Main Freezer
      IF v_returned > 0 THEN
        INSERT INTO stock_movements (
          product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          v_issue_item.product_id, v_seller_loc_id, v_freezer_loc_id, v_returned, 'seller_returned', 'seller_settlements', v_settlement_id, 'Returned to freezer: ' || v_settlement_number, p_user_id
        );
      END IF;

      -- Damaged stock moves to damaged stock location
      IF v_damaged > 0 THEN
        INSERT INTO stock_movements (
          product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          v_issue_item.product_id, v_seller_loc_id, v_damaged_loc_id, v_damaged, 'damaged', 'seller_settlements', v_settlement_id, 'Seller damaged: ' || COALESCE(v_item->>'damage_reason', ''), p_user_id
        );
      END IF;

      -- Complimentary pieces move to complimentary location
      IF v_comp > 0 THEN
        INSERT INTO stock_movements (
          product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
        ) VALUES (
          v_issue_item.product_id, v_seller_loc_id, v_comp_loc_id, v_comp, 'complimentary', 'seller_settlements', v_settlement_id, 'Complimentary: ' || COALESCE(v_item->>'comp_reason', ''), p_user_id
        );
      END IF;
    END IF;
  END LOOP;

  -- Financial Calculations
  v_expected_collection := GREATEST(0.00, v_tot_gross - v_tot_commission);
  v_total_received := COALESCE(p_cash, 0.00) + COALESCE(p_upi, 0.00);
  v_accounted_amount := v_total_received + COALESCE(p_credit, 0.00);
  v_diff := v_accounted_amount - v_expected_collection;

  IF v_diff < 0 THEN
    v_shortage := ABS(v_diff);
  ELSE
    v_shortage := 0.00;
  END IF;

  v_outstanding := COALESCE(p_credit, 0.00) + v_shortage;

  -- Update Settlement Header with Server Calculated Totals
  UPDATE seller_settlements
  SET gross_sales = v_tot_gross,
      total_commission = v_tot_commission,
      expected_collection = v_expected_collection,
      total_received = v_total_received,
      outstanding_amount = v_outstanding,
      shortage_amount = v_shortage,
      updated_at = NOW()
  WHERE id = v_settlement_id;

  IF p_is_approved_by_owner THEN
    UPDATE seller_issues SET status = 'settled', updated_at = NOW() WHERE id = p_seller_issue_id;
  ELSE
    UPDATE seller_issues SET status = 'partially_settled', updated_at = NOW() WHERE id = p_seller_issue_id;
  END IF;

  -- Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'seller_settlements',
    v_settlement_id,
    CASE WHEN p_is_approved_by_owner THEN 'APPROVE_SETTLEMENT' ELSE 'SUBMIT_SETTLEMENT' END,
    jsonb_build_object('settlement_number', v_settlement_number, 'gross_sales', v_tot_gross, 'status', v_status),
    'Seller settlement processed',
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'settlement_number', v_settlement_number,
    'gross_sales', v_tot_gross,
    'total_commission', v_tot_commission,
    'expected_collection', v_expected_collection,
    'total_received', v_total_received,
    'shortage_amount', v_shortage,
    'status', v_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION approve_pending_settlement(
  p_settlement_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_settlement RECORD;
  v_item RECORD;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_damaged_loc_id UUID;
  v_comp_loc_id UUID;
BEGIN
  SELECT * INTO v_settlement FROM seller_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found';
  END IF;

  IF v_settlement.status = 'approved' THEN
    RAISE EXCEPTION 'Settlement is already approved';
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_settlement.seller_id);
  v_damaged_loc_id := get_or_create_stock_location('damaged');
  v_comp_loc_id := get_or_create_stock_location('complimentary');

  -- Move stock for each settlement item
  FOR v_item IN SELECT * FROM settlement_items WHERE settlement_id = p_settlement_id LOOP
    IF v_item.returned_quantity > 0 THEN
      INSERT INTO stock_movements (
        product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        v_item.product_id, v_seller_loc_id, v_freezer_loc_id, v_item.returned_quantity, 'seller_returned', 'seller_settlements', p_settlement_id, 'Returned stock: ' || v_settlement.settlement_number, p_user_id
      );
    END IF;

    IF v_item.damaged_quantity > 0 THEN
      INSERT INTO stock_movements (
        product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        v_item.product_id, v_seller_loc_id, v_damaged_loc_id, v_item.damaged_quantity, 'damaged', 'seller_settlements', p_settlement_id, 'Damaged stock approved: ' || COALESCE(v_item.damage_reason, ''), p_user_id
      );
    END IF;

    IF v_item.complimentary_quantity > 0 THEN
      INSERT INTO stock_movements (
        product_id, source_location_id, destination_location_id, quantity, movement_type, reference_table, reference_id, notes, created_by
      ) VALUES (
        v_item.product_id, v_seller_loc_id, v_comp_loc_id, v_item.complimentary_quantity, 'complimentary', 'seller_settlements', p_settlement_id, 'Complimentary approved: ' || COALESCE(v_item.complimentary_reason, ''), p_user_id
      );
    END IF;
  END LOOP;

  -- Update Settlement Status
  UPDATE seller_settlements
  SET status = 'approved',
      approved_by = p_user_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_settlement_id;

  -- Update Issue Status
  UPDATE seller_issues
  SET status = 'settled',
      updated_at = NOW()
  WHERE id = v_settlement.seller_issue_id;

  -- Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'seller_settlements',
    p_settlement_id,
    'APPROVE_SETTLEMENT',
    row_to_json(v_settlement)::jsonb,
    jsonb_build_object('status', 'approved', 'approved_by', p_user_id),
    'Owner approved settlement',
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'settlement_id', p_settlement_id, 'status', 'approved');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE OR REPLACE FUNCTION delete_seller_settlement_transaction(
  p_settlement_id UUID,
  p_reason TEXT DEFAULT 'Deleted by Owner',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_settlement RECORD;
  v_item RECORD;
  v_seller_loc_id UUID;
  v_freezer_loc_id UUID;
  v_damaged_loc_id UUID;
  v_comp_loc_id UUID;
  v_closing RECORD;
BEGIN
  SELECT * INTO v_settlement FROM seller_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found.';
  END IF;

  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_settlement.settlement_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_settlement.settlement_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_settlement.seller_id, 'Seller Cart');
  v_damaged_loc_id := get_or_create_stock_location('damaged', NULL, 'Damaged Stock');
  v_comp_loc_id := get_or_create_stock_location('complimentary', NULL, 'Complimentary Stock');

  IF v_settlement.status = 'approved' THEN
    FOR v_item IN SELECT * FROM settlement_items WHERE settlement_id = p_settlement_id LOOP
      IF COALESCE(v_item.returned_quantity, 0) > 0 THEN
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
          v_item.product_id,
          v_freezer_loc_id,
          v_seller_loc_id,
          v_item.returned_quantity,
          'settlement_reversal',
          'seller_settlements',
          p_settlement_id,
          'Returned stock reversed for deleted settlement ' || v_settlement.settlement_number,
          p_user_id
        );
      END IF;

      IF COALESCE(v_item.damaged_quantity, 0) > 0 THEN
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
          v_item.product_id,
          v_damaged_loc_id,
          v_seller_loc_id,
          v_item.damaged_quantity,
          'settlement_reversal',
          'seller_settlements',
          p_settlement_id,
          'Damaged stock reversed for deleted settlement ' || v_settlement.settlement_number,
          p_user_id
        );
      END IF;

      IF COALESCE(v_item.complimentary_quantity, 0) > 0 THEN
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
          v_item.product_id,
          v_comp_loc_id,
          v_seller_loc_id,
          v_item.complimentary_quantity,
          'settlement_reversal',
          'seller_settlements',
          p_settlement_id,
          'Complimentary stock reversed for deleted settlement ' || v_settlement.settlement_number,
          p_user_id
        );
      END IF;
    END LOOP;

    UPDATE seller_issues
    SET status = 'issued', updated_at = NOW()
    WHERE id = v_settlement.seller_issue_id OR id = v_settlement.issue_id;
  END IF;

  -- Unlink self-referencing correction chains
  UPDATE seller_settlements SET correction_of_id = NULL WHERE correction_of_id = p_settlement_id;
  UPDATE seller_settlements SET superseded_by_id = NULL WHERE superseded_by_id = p_settlement_id;

  DELETE FROM settlement_items WHERE settlement_id = p_settlement_id;
  DELETE FROM seller_settlements WHERE id = p_settlement_id;

  RETURN jsonb_build_object('success', true, 'message', 'Settlement deleted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 6.6 Daily Business & Expenses
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION close_business_day(
  p_business_date DATE,
  p_notes TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_unsettled_count INT;
  v_draft_batch_count INT;
  v_pending_settlement_count INT;
  v_tot_produced INT := 0;
  v_tot_sold INT := 0;
  v_tot_returned INT := 0;
  v_tot_damaged INT := 0;
  v_tot_comp INT := 0;
  v_gross_sales NUMERIC(12,2) := 0.00;
  v_tot_commission NUMERIC(12,2) := 0.00;
  v_net_sales NUMERIC(12,2) := 0.00;
  v_cash_received NUMERIC(12,2) := 0.00;
  v_upi_received NUMERIC(12,2) := 0.00;
  v_credit_sales NUMERIC(12,2) := 0.00;
  v_tot_expenses NUMERIC(12,2) := 0.00;
  v_tot_ingredient_cost NUMERIC(12,2) := 0.00;
  v_estimated_profit NUMERIC(12,2) := 0.00;
  v_closing_stock_val NUMERIC(12,2) := 0.00;
  v_closing_id UUID;
  v_existing RECORD;
BEGIN
  -- 1. Pre-closing Blocking Checks
  SELECT COUNT(*) INTO v_draft_batch_count 
  FROM production_batches 
  WHERE production_date = p_business_date AND status = 'draft';

  IF v_draft_batch_count > 0 THEN
    RAISE EXCEPTION 'Cannot close day. There are % draft production batches that must be completed or cancelled first.', v_draft_batch_count;
  END IF;

  SELECT COUNT(*) INTO v_unsettled_count 
  FROM seller_issues 
  WHERE issue_date = p_business_date AND status IN ('issued', 'partially_settled');

  IF v_unsettled_count > 0 THEN
    RAISE EXCEPTION 'Cannot close day. There are % unsettled seller issues for this date.', v_unsettled_count;
  END IF;

  SELECT COUNT(*) INTO v_pending_settlement_count
  FROM seller_settlements
  WHERE settlement_date = p_business_date AND status = 'pending_approval';

  IF v_pending_settlement_count > 0 THEN
    RAISE EXCEPTION 'Cannot close day. There are % settlements awaiting owner approval.', v_pending_settlement_count;
  END IF;

  -- 2. Aggregate Production for the day
  SELECT 
    COALESCE(SUM(pi.produced_quantity), 0),
    COALESCE(SUM(pb.total_ingredient_cost), 0)
  INTO v_tot_produced, v_tot_ingredient_cost
  FROM production_batches pb
  JOIN production_items pi ON pb.id = pi.batch_id
  WHERE pb.production_date = p_business_date AND pb.status = 'completed';

  -- 3. Aggregate Approved Settlements for the day
  SELECT
    COALESCE(SUM(si.sold_quantity), 0),
    COALESCE(SUM(si.returned_quantity), 0),
    COALESCE(SUM(si.damaged_quantity), 0),
    COALESCE(SUM(si.complimentary_quantity), 0),
    COALESCE(SUM(ss.gross_sales), 0.00),
    COALESCE(SUM(ss.total_commission), 0.00),
    COALESCE(SUM(ss.cash_received), 0.00),
    COALESCE(SUM(ss.upi_received), 0.00),
    COALESCE(SUM(ss.credit_amount), 0.00)
  INTO 
    v_tot_sold,
    v_tot_returned,
    v_tot_damaged,
    v_tot_comp,
    v_gross_sales,
    v_tot_commission,
    v_cash_received,
    v_upi_received,
    v_credit_sales
  FROM seller_settlements ss
  JOIN settlement_items si ON ss.id = si.settlement_id
  WHERE ss.settlement_date = p_business_date AND ss.status = 'approved';

  v_net_sales := v_gross_sales - v_tot_commission;

  -- 4. Aggregate Active Operating Expenses (excluding seller commission if already accounted)
  SELECT COALESCE(SUM(amount), 0.00) INTO v_tot_expenses
  FROM expenses
  WHERE expense_date = p_business_date 
    AND status = 'active'
    AND category != 'seller_commission'; -- Avoid double counting commission

  -- 5. Calculate Estimated Daily Profit
  -- Formula: Gross sales - seller commissions - allocated production ingredient costs - other operating expenses
  v_estimated_profit := v_gross_sales - v_tot_commission - v_tot_ingredient_cost - v_tot_expenses;

  -- 6. Calculate Closing Stock Value in Freezer
  SELECT COALESCE(SUM(
    fs.available_quantity * COALESCE(
      (SELECT selling_price FROM product_prices WHERE product_id = fs.product_id ORDER BY effective_from DESC LIMIT 1), 0
    )
  ), 0.00) INTO v_closing_stock_val
  FROM v_freezer_stock fs;

  -- 7. Upsert Daily Closing Record
  SELECT * INTO v_existing FROM daily_closings WHERE business_date = p_business_date;

  IF FOUND THEN
    IF v_existing.status = 'closed' THEN
      RAISE EXCEPTION 'Business day % is already closed', p_business_date;
    END IF;

    UPDATE daily_closings
    SET status = 'closed',
        total_produced = v_tot_produced,
        total_sold = v_tot_sold,
        total_returned = v_tot_returned,
        total_damaged = v_tot_damaged,
        total_complimentary = v_tot_comp,
        gross_sales = v_gross_sales,
        total_commission = v_tot_commission,
        net_sales = v_net_sales,
        cash_received = v_cash_received,
        upi_received = v_upi_received,
        credit_sales = v_credit_sales,
        total_expenses = v_tot_expenses,
        estimated_profit = v_estimated_profit,
        closing_stock_value = v_closing_stock_val,
        notes = p_notes,
        closed_by = p_user_id,
        closed_at = NOW(),
        reopened_by = NULL,
        reopened_at = NULL,
        reopen_reason = NULL
    WHERE business_date = p_business_date
    RETURNING id INTO v_closing_id;
  ELSE
    INSERT INTO daily_closings (
      business_date,
      status,
      total_produced,
      total_sold,
      total_returned,
      total_damaged,
      total_complimentary,
      gross_sales,
      total_commission,
      net_sales,
      cash_received,
      upi_received,
      credit_sales,
      total_expenses,
      estimated_profit,
      closing_stock_value,
      notes,
      closed_by,
      closed_at
    ) VALUES (
      p_business_date,
      'closed',
      v_tot_produced,
      v_tot_sold,
      v_tot_returned,
      v_tot_damaged,
      v_tot_comp,
      v_gross_sales,
      v_tot_commission,
      v_net_sales,
      v_cash_received,
      v_upi_received,
      v_credit_sales,
      v_tot_expenses,
      v_estimated_profit,
      v_closing_stock_val,
      p_notes,
      p_user_id,
      NOW()
    ) RETURNING id INTO v_closing_id;
  END IF;

  -- Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, new_data, reason, performed_by)
  VALUES (
    'daily_closings',
    v_closing_id,
    'CLOSE_BUSINESS_DAY',
    jsonb_build_object('business_date', p_business_date, 'estimated_profit', v_estimated_profit),
    'Daily closing finalized',
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'closing_id', v_closing_id,
    'business_date', p_business_date,
    'gross_sales', v_gross_sales,
    'net_sales', v_net_sales,
    'total_expenses', v_tot_expenses,
    'estimated_profit', v_estimated_profit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reopen_business_day(
  p_business_date DATE,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_closing RECORD;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A clear, mandatory reason of at least 5 characters is required to reopen a closed business day.';
  END IF;

  SELECT * INTO v_closing FROM daily_closings WHERE business_date = p_business_date FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No closing record found for business date %', p_business_date;
  END IF;

  IF v_closing.status = 'reopened' THEN
    RAISE EXCEPTION 'Business day % is already reopened', p_business_date;
  END IF;

  UPDATE daily_closings
  SET status = 'reopened',
      reopened_by = p_user_id,
      reopened_at = NOW(),
      reopen_reason = p_reason
  WHERE business_date = p_business_date;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'daily_closings',
    v_closing.id,
    'REOPEN_BUSINESS_DAY',
    row_to_json(v_closing)::jsonb,
    jsonb_build_object('status', 'reopened', 'reopen_reason', p_reason),
    p_reason,
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'business_date', p_business_date, 'status', 'reopened');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION void_expense(
  p_expense_id UUID,
  p_reason TEXT,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_expense RECORD;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A valid reason is required to void an expense.';
  END IF;

  SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_expense.status = 'voided' THEN
    RAISE EXCEPTION 'Expense is already voided';
  END IF;

  UPDATE expenses
  SET status = 'voided',
      void_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_expense_id;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'expenses',
    p_expense_id,
    'VOID_EXPENSE',
    row_to_json(v_expense)::jsonb,
    jsonb_build_object('status', 'voided', 'void_reason', p_reason),
    p_reason,
    p_user_id
  );

  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id, 'status', 'voided');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION delete_or_archive_expense_head(
  p_head_id UUID,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_head RECORD;
  v_usage_count INTEGER;
  v_user_uuid UUID := NULL;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  SELECT * INTO v_head FROM expense_heads WHERE id = p_head_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense head not found';
  END IF;

  -- Check if referenced in expenses
  SELECT COUNT(*) INTO v_usage_count FROM expenses WHERE expense_head_id = p_head_id;

  IF v_usage_count = 0 THEN
    -- Completely unused -> Hard delete
    DELETE FROM expense_heads WHERE id = p_head_id;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
    VALUES (
      'expense_heads',
      p_head_id,
      'DELETE_EXPENSE_HEAD',
      row_to_json(v_head)::jsonb,
      NULL,
      'Unused expense head permanently deleted',
      v_user_uuid
    );

    RETURN jsonb_build_object('success', true, 'action', 'deleted', 'message', 'Expense head permanently deleted');
  ELSE
    -- Referenced by expenses -> Archive (soft deactivate)
    UPDATE expense_heads
    SET is_archived = true,
        is_active = false,
        updated_at = NOW()
    WHERE id = p_head_id;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
    VALUES (
      'expense_heads',
      p_head_id,
      'ARCHIVE_EXPENSE_HEAD',
      row_to_json(v_head)::jsonb,
      jsonb_build_object('is_archived', true, 'is_active', false),
      'Expense head archived because it has past transactions',
      v_user_uuid
    );

    RETURN jsonb_build_object('success', true, 'action', 'archived', 'message', 'Expense head archived because it has past transactions');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION correct_paid_expense(
  p_expense_id UUID,
  p_new_amount NUMERIC,
  p_new_payment_method TEXT,
  p_new_date DATE,
  p_new_description TEXT,
  p_reason TEXT,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_old_expense RECORD;
  v_new_expense_id UUID;
  v_user_uuid UUID := NULL;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A valid correction reason is required.';
  END IF;

  IF p_new_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero.';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  SELECT * INTO v_old_expense FROM expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  -- 1. Void old expense
  UPDATE expenses
  SET status = 'voided',
      void_reason = 'Correction: ' || p_reason,
      updated_at = NOW()
  WHERE id = p_expense_id;

  -- 2. Insert corrected replacement expense
  INSERT INTO expenses (
    expense_date,
    category,
    amount,
    payment_method,
    description,
    vendor_name,
    status,
    expense_head_id,
    expense_month,
    due_date,
    corrected_from_expense_id,
    is_monthly_fixed,
    created_by
  ) VALUES (
    COALESCE(p_new_date, v_old_expense.expense_date),
    v_old_expense.category,
    p_new_amount,
    COALESCE(p_new_payment_method::payment_method, v_old_expense.payment_method),
    COALESCE(p_new_description, v_old_expense.description),
    v_old_expense.vendor_name,
    'active',
    v_old_expense.expense_head_id,
    v_old_expense.expense_month,
    v_old_expense.due_date,
    p_expense_id,
    v_old_expense.is_monthly_fixed,
    v_user_uuid
  ) RETURNING id INTO v_new_expense_id;

  -- 3. Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'expenses',
    v_new_expense_id,
    'CORRECT_EXPENSE',
    row_to_json(v_old_expense)::jsonb,
    jsonb_build_object('id', v_new_expense_id, 'amount', p_new_amount, 'corrected_from', p_expense_id),
    p_reason,
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_expense_id', p_expense_id,
    'new_expense_id', v_new_expense_id,
    'amount', p_new_amount,
    'message', 'Expense corrected and replacement recorded'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION copy_previous_month_fixed_expenses(
  p_source_month TEXT,
  p_target_month TEXT,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_rec RECORD;
  v_copied_count INTEGER := 0;
  v_user_uuid UUID := NULL;
  v_target_due_date DATE;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  -- Loop through active fixed expense heads
  FOR v_rec IN 
    SELECT 
      eh.id AS head_id,
      eh.code,
      eh.name_en,
      eh.name_hi,
      eh.due_day,
      eh.default_amount,
      COALESCE(prev_exp.amount, eh.default_amount) AS amount_to_copy,
      COALESCE(prev_exp.payment_method, 'cash'::payment_method) AS payment_method,
      COALESCE(prev_exp.vendor_name, eh.name_en) AS vendor_name
    FROM expense_heads eh
    LEFT JOIN (
      SELECT DISTINCT ON (expense_head_id) *
      FROM expenses
      WHERE expense_month = p_source_month AND status = 'active'
      ORDER BY expense_head_id, created_at DESC
    ) prev_exp ON prev_exp.expense_head_id = eh.id
    WHERE eh.expense_group = 'monthly_fixed' AND eh.is_active = true AND eh.is_archived = false
  LOOP
    -- Calculate due date in target month (e.g. '2026-09-05')
    BEGIN
      v_target_due_date := TO_DATE(p_target_month || '-' || LPAD(v_rec.due_day::TEXT, 2, '0'), 'YYYY-MM-DD');
    EXCEPTION WHEN OTHERS THEN
      v_target_due_date := TO_DATE(p_target_month || '-01', 'YYYY-MM-DD');
    END;

    -- Only insert if not already confirmed/active for target month
    IF NOT EXISTS (
      SELECT 1 FROM expenses 
      WHERE expense_head_id = v_rec.head_id AND expense_month = p_target_month AND status = 'active'
    ) THEN
      INSERT INTO expenses (
        expense_date,
        category,
        amount,
        payment_method,
        description,
        vendor_name,
        status,
        expense_head_id,
        expense_month,
        due_date,
        is_monthly_fixed,
        created_by
      ) VALUES (
        v_target_due_date,
        'other'::expense_category,
        v_rec.amount_to_copy,
        v_rec.payment_method,
        v_rec.name_hi || ' (' || p_target_month || ')',
        v_rec.vendor_name,
        'active',
        v_rec.head_id,
        p_target_month,
        v_target_due_date,
        true,
        v_user_uuid
      );
      v_copied_count := v_copied_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'copied_count', v_copied_count,
    'target_month', p_target_month
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 6.7 Simple LPG Cylinder Register
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION format_lpg_duration(p_hours NUMERIC)
RETURNS TEXT AS $$
DECLARE
  v_days INTEGER;
  v_rem_hours INTEGER;
BEGIN
  IF p_hours IS NULL OR p_hours <= 0 THEN
    RETURN '0 घंटे';
  END IF;

  v_days := FLOOR(p_hours / 24.0);
  v_rem_hours := ROUND(p_hours - (v_days * 24));

  IF v_days > 0 THEN
    IF v_rem_hours > 0 THEN
      RETURN v_days || ' दिन ' || v_rem_hours || ' घंटे';
    ELSE
      RETURN v_days || ' दिन';
    END IF;
  ELSE
    RETURN GREATEST(1, v_rem_hours) || ' घंटे';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION add_lpg_cylinder_transaction(
  p_cylinder_code TEXT,
  p_status TEXT DEFAULT 'full',
  p_supplier_id TEXT DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_place TEXT DEFAULT NULL,
  p_starting_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_clean_code TEXT;
  v_cyl_id UUID;
  v_user_uuid UUID := NULL;
  v_supplier_uuid UUID := NULL;
  v_initial_movement_type TEXT;
  v_initial_place TEXT;
  v_eff_date TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  IF p_supplier_id IS NOT NULL AND p_supplier_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supplier_uuid := p_supplier_id::UUID;
  END IF;

  v_clean_code := UPPER(TRIM(p_cylinder_code));
  IF v_clean_code IS NULL OR length(v_clean_code) < 1 THEN
    RAISE EXCEPTION 'Cylinder ID/Code is required.';
  END IF;

  v_eff_date := COALESCE(p_starting_date::TIMESTAMPTZ, NOW());

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT cylinder_id INTO v_cyl_id FROM lpg_cylinder_movements WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'cylinder_id', v_cyl_id,
        'cylinder_code', v_clean_code,
        'message', 'Cylinder already created (idempotent replay).'
      );
    END IF;
  END IF;

  -- Unique code check
  IF EXISTS (SELECT 1 FROM lpg_cylinders WHERE UPPER(TRIM(cylinder_code)) = v_clean_code) THEN
    RAISE EXCEPTION 'Cylinder code "%" already exists. Please choose a unique code.', v_clean_code;
  END IF;

  v_initial_place := COALESCE(p_place, CASE WHEN p_status = 'connected' THEN 'भट्टी 1' ELSE 'Main Store' END);

  -- 1. Insert cylinder
  INSERT INTO lpg_cylinders (
    cylinder_code, status, current_place, supplier_id, supplier_name,
    notes, is_active, connected_at, last_movement_at
  ) VALUES (
    v_clean_code,
    COALESCE(p_status, 'full'),
    v_initial_place,
    v_supplier_uuid,
    p_supplier_name,
    p_notes,
    true,
    CASE WHEN p_status = 'connected' THEN v_eff_date ELSE NULL END,
    v_eff_date
  ) RETURNING id INTO v_cyl_id;

  -- 2. Initial movement entry
  v_initial_movement_type := CASE WHEN p_status = 'connected' THEN 'connected' ELSE 'cylinder_added' END;

  INSERT INTO lpg_cylinder_movements (
    cylinder_id, movement_type, movement_date, place, supplier_name,
    notes, idempotency_key, created_by
  ) VALUES (
    v_cyl_id,
    v_initial_movement_type,
    v_eff_date,
    v_initial_place,
    p_supplier_name,
    COALESCE(p_notes, 'Initial cylinder registration'),
    p_idempotency_key,
    v_user_uuid
  );

  -- 3. Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'lpg_cylinders',
    v_cyl_id,
    'ADD_LPG_CYLINDER',
    NULL,
    jsonb_build_object('id', v_cyl_id, 'code', v_clean_code, 'status', p_status),
    'New cylinder registered: ' || v_clean_code,
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'cylinder_id', v_cyl_id,
    'cylinder_code', v_clean_code,
    'status', p_status,
    'message', 'सिलेंडर सफलतापूर्वक जोड़ा गया'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION record_lpg_cylinder_movement_transaction(
  p_cylinder_id UUID,
  p_movement_type TEXT,
  p_movement_date TIMESTAMPTZ DEFAULT NOW(),
  p_movement_time TEXT DEFAULT NULL,
  p_place TEXT DEFAULT NULL,
  p_bhatti_place TEXT DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_bill_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_cyl RECORD;
  v_user_uuid UUID := NULL;
  v_mov_id UUID;
  v_connected_at TIMESTAMPTZ := NULL;
  v_empty_at TIMESTAMPTZ := NULL;
  v_duration_hours NUMERIC(10,2) := NULL;
  v_duration_display TEXT := NULL;
  v_target_place TEXT;
  v_new_status TEXT;
  v_eff_date TIMESTAMPTZ;
  v_input_place TEXT;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  v_eff_date := COALESCE(p_movement_date, NOW());
  v_input_place := COALESCE(p_bhatti_place, p_place);

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_mov_id FROM lpg_cylinder_movements WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'movement_id', v_mov_id,
        'message', 'Movement already processed (idempotent replay).'
      );
    END IF;
  END IF;

  -- Lock cylinder record
  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = p_cylinder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cylinder not found';
  END IF;

  IF NOT v_cyl.is_active THEN
    RAISE EXCEPTION 'Cannot record movement on an inactive/archived cylinder.';
  END IF;

  -- State Transition Rules
  IF p_movement_type = 'connected' THEN
    IF v_cyl.status = 'connected' THEN
      RAISE EXCEPTION 'Cylinder % is already connected to %.', v_cyl.cylinder_code, COALESCE(v_cyl.current_place, 'bhatti');
    END IF;

    v_new_status := 'connected';
    v_target_place := COALESCE(v_input_place, v_cyl.current_place, 'भट्टी 1');
    v_connected_at := v_eff_date;

    UPDATE lpg_cylinders
    SET status = 'connected',
        current_place = v_target_place,
        connected_at = v_eff_date,
        last_movement_at = v_eff_date,
        updated_at = NOW()
    WHERE id = p_cylinder_id;

  ELSIF p_movement_type = 'empty_removed' THEN
    v_new_status := 'empty';
    v_target_place := COALESCE(v_input_place, 'Empty Storage');
    v_empty_at := v_eff_date;
    v_connected_at := v_cyl.connected_at;

    IF v_connected_at IS NOT NULL AND v_empty_at >= v_connected_at THEN
      v_duration_hours := ROUND(EXTRACT(EPOCH FROM (v_empty_at - v_connected_at)) / 3600.0, 2);
      v_duration_display := format_lpg_duration(v_duration_hours);
    END IF;

    UPDATE lpg_cylinders
    SET status = 'empty',
        current_place = v_target_place,
        connected_at = NULL,
        last_movement_at = v_eff_date,
        updated_at = NOW()
    WHERE id = p_cylinder_id;

  ELSIF p_movement_type = 'refill_sent' THEN
    IF v_cyl.status = 'connected' THEN
      RAISE EXCEPTION 'Cannot send a connected cylinder for refill. Please mark it Empty/Removed first.';
    END IF;

    v_new_status := 'sent_for_refill';
    v_target_place := COALESCE(v_input_place, 'Gas Agency');

    UPDATE lpg_cylinders
    SET status = 'sent_for_refill',
        current_place = v_target_place,
        supplier_name = COALESCE(p_supplier_name, v_cyl.supplier_name),
        last_movement_at = v_eff_date,
        updated_at = NOW()
    WHERE id = p_cylinder_id;

  ELSIF p_movement_type = 'refill_received' THEN
    v_new_status := 'full';
    v_target_place := COALESCE(v_input_place, 'Main Store');

    UPDATE lpg_cylinders
    SET status = 'full',
        current_place = v_target_place,
        supplier_name = COALESCE(p_supplier_name, v_cyl.supplier_name),
        last_movement_at = v_eff_date,
        updated_at = NOW()
    WHERE id = p_cylinder_id;

  ELSE
    RAISE EXCEPTION 'Invalid movement type: %', p_movement_type;
  END IF;

  -- Insert movement record
  INSERT INTO lpg_cylinder_movements (
    cylinder_id, movement_type, movement_date, place,
    connected_at, empty_removed_at, running_duration_hours, running_duration_display,
    supplier_name, bill_number, notes, idempotency_key, created_by
  ) VALUES (
    p_cylinder_id,
    p_movement_type,
    v_eff_date,
    v_target_place,
    v_connected_at,
    v_empty_at,
    v_duration_hours,
    v_duration_display,
    p_supplier_name,
    p_bill_number,
    p_notes,
    p_idempotency_key,
    v_user_uuid
  ) RETURNING id INTO v_mov_id;

  -- Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'lpg_cylinder_movements',
    v_mov_id,
    'LPG_MOVEMENT_' || UPPER(p_movement_type),
    jsonb_build_object('prev_status', v_cyl.status, 'prev_place', v_cyl.current_place),
    jsonb_build_object('new_status', v_new_status, 'place', v_target_place, 'duration', v_duration_display),
    COALESCE(p_notes, 'Cylinder movement: ' || p_movement_type),
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_mov_id,
    'cylinder_id', p_cylinder_id,
    'cylinder_code', v_cyl.cylinder_code,
    'new_status', v_new_status,
    'running_duration_display', v_duration_display,
    'message', 'मूवमेंट सफलतापूर्वक दर्ज हुआ'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION correct_lpg_cylinder_movement_transaction(
  p_movement_id UUID,
  p_reason TEXT,
  p_corrected_movement_type TEXT DEFAULT NULL,
  p_corrected_date TIMESTAMPTZ DEFAULT NULL,
  p_corrected_time TEXT DEFAULT NULL,
  p_corrected_place TEXT DEFAULT NULL,
  p_corrected_bhatti_place TEXT DEFAULT NULL,
  p_corrected_supplier_name TEXT DEFAULT NULL,
  p_corrected_bill_number TEXT DEFAULT NULL,
  p_corrected_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_old_mov RECORD;
  v_cyl RECORD;
  v_user_uuid UUID := NULL;
  v_new_mov_id UUID;
  v_latest_mov RECORD;
  v_corr_place TEXT;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A valid correction reason is required (min 3 characters).';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  v_corr_place := COALESCE(p_corrected_bhatti_place, p_corrected_place);

  SELECT * INTO v_old_mov FROM lpg_cylinder_movements WHERE id = p_movement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movement record not found';
  END IF;

  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = v_old_mov.cylinder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated cylinder not found';
  END IF;

  -- 1. Insert correction movement linking to old movement
  INSERT INTO lpg_cylinder_movements (
    cylinder_id,
    movement_type,
    movement_date,
    place,
    supplier_name,
    bill_number,
    notes,
    corrected_from_movement_id,
    idempotency_key,
    created_by
  ) VALUES (
    v_old_mov.cylinder_id,
    'correction',
    COALESCE(p_corrected_date, NOW()),
    COALESCE(v_corr_place, v_old_mov.place),
    COALESCE(p_corrected_supplier_name, v_old_mov.supplier_name),
    COALESCE(p_corrected_bill_number, v_old_mov.bill_number),
    'Correction: ' || p_reason || ' | ' || COALESCE(p_corrected_notes, ''),
    p_movement_id,
    p_idempotency_key,
    v_user_uuid
  ) RETURNING id INTO v_new_mov_id;

  -- 2. Recalculate status from the latest valid non-correction movement
  SELECT * INTO v_latest_mov
  FROM lpg_cylinder_movements
  WHERE cylinder_id = v_old_mov.cylinder_id AND id <> p_movement_id
  ORDER BY movement_date DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE lpg_cylinders
    SET status = CASE 
          WHEN v_latest_mov.movement_type = 'connected' THEN 'connected'
          WHEN v_latest_mov.movement_type = 'empty_removed' THEN 'empty'
          WHEN v_latest_mov.movement_type = 'refill_sent' THEN 'sent_for_refill'
          ELSE 'full'
        END,
        current_place = COALESCE(v_corr_place, v_latest_mov.place, 'Main Store'),
        last_movement_at = NOW(),
        updated_at = NOW()
    WHERE id = v_old_mov.cylinder_id;
  END IF;

  -- 3. Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'lpg_cylinder_movements',
    v_new_mov_id,
    'CORRECT_LPG_MOVEMENT',
    row_to_json(v_old_mov)::jsonb,
    jsonb_build_object('corrected_by_id', v_new_mov_id, 'reason', p_reason),
    p_reason,
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'corrected_movement_id', v_new_mov_id,
    'old_movement_id', p_movement_id,
    'message', 'मूवमेंट सुधार दर्ज हुआ और सिलेंडर स्थिति पुनः अपडेट हुई'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION delete_or_archive_lpg_cylinder_transaction(
  p_cylinder_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_cyl RECORD;
  v_user_uuid UUID := NULL;
  v_op_count INTEGER;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = p_cylinder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cylinder not found';
  END IF;

  -- Rule: Connected cylinder cannot be removed/archived
  IF v_cyl.status = 'connected' THEN
    RAISE EXCEPTION 'Cannot remove a connected cylinder. Please mark it Empty/Removed first before archiving.';
  END IF;

  -- Check if cylinder has operational movements beyond initial creation
  SELECT COUNT(*) INTO v_op_count 
  FROM lpg_cylinder_movements 
  WHERE cylinder_id = p_cylinder_id 
    AND movement_type NOT IN ('cylinder_added');

  IF v_op_count = 0 THEN
    -- Completely unused -> Permanent Delete
    DELETE FROM lpg_cylinder_movements WHERE cylinder_id = p_cylinder_id;
    DELETE FROM lpg_cylinders WHERE id = p_cylinder_id;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
    VALUES (
      'lpg_cylinders',
      p_cylinder_id,
      'DELETE_LPG_CYLINDER',
      row_to_json(v_cyl)::jsonb,
      NULL,
      COALESCE(p_reason, 'Unused cylinder permanently deleted'),
      v_user_uuid
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'deleted',
      'message', 'अउपयोगी सिलेंडर स्थायी रूप से हटाया गया (Permanently Deleted)'
    );
  ELSE
    -- Has operational history -> Archive (soft deactivate)
    UPDATE lpg_cylinders
    SET is_active = false,
        status = 'inactive',
        updated_at = NOW()
    WHERE id = p_cylinder_id;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
    VALUES (
      'lpg_cylinders',
      p_cylinder_id,
      'ARCHIVE_LPG_CYLINDER',
      row_to_json(v_cyl)::jsonb,
      jsonb_build_object('is_active', false, 'status', 'inactive'),
      COALESCE(p_reason, 'Cylinder archived to preserve movement history'),
      v_user_uuid
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'archived',
      'message', 'सिलेंडर सुरक्षित रूप से संग्रहित (Archived) किया गया'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reactivate_lpg_cylinder_transaction(
  p_cylinder_id UUID,
  p_status TEXT DEFAULT 'full',
  p_reason TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_cyl RECORD;
  v_user_uuid UUID := NULL;
  v_clean_status TEXT;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  v_clean_status := COALESCE(p_status, 'full');

  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = p_cylinder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cylinder not found';
  END IF;

  UPDATE lpg_cylinders
  SET is_active = true,
      status = v_clean_status,
      updated_at = NOW()
  WHERE id = p_cylinder_id;

  INSERT INTO lpg_cylinder_movements (
    cylinder_id, movement_type, movement_date, place, notes, created_by
  ) VALUES (
    p_cylinder_id,
    'cylinder_added',
    NOW(),
    v_cyl.current_place,
    COALESCE(p_reason, 'Reactivated from archive as ' || v_clean_status),
    v_user_uuid
  );

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'lpg_cylinders',
    p_cylinder_id,
    'REACTIVATE_LPG_CYLINDER',
    row_to_json(v_cyl)::jsonb,
    jsonb_build_object('is_active', true, 'status', v_clean_status),
    'Cylinder reactivated from archive',
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'cylinder_id', p_cylinder_id,
    'status', v_clean_status,
    'message', 'सिलेंडर पुनः सक्रिय किया गया (Reactivated)'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ----------------------------------------------------------------------------
-- 6.8 Backup & Audit
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION log_backup_operation(
  p_backup_type TEXT,
  p_file_name TEXT,
  p_table_counts JSONB,
  p_checksums JSONB,
  p_status TEXT,
  p_error_summary TEXT,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
BEGIN
  -- Verify Owner permission
  IF NOT (SELECT role = 'owner' FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Access Denied: Only Owner role is authorized to perform or record backups.';
  END IF;

  INSERT INTO backup_history (
    backup_type,
    file_name,
    table_counts,
    checksum_summary,
    status,
    error_summary,
    created_by,
    created_at
  ) VALUES (
    p_backup_type,
    p_file_name,
    p_table_counts,
    p_checksums,
    p_status,
    p_error_summary,
    p_user_id,
    NOW()
  ) RETURNING id INTO v_history_id;

  -- Add audit log entry
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    change_reason,
    user_id,
    created_at
  ) VALUES (
    'backup_history',
    v_history_id,
    'CREATE_BACKUP',
    jsonb_build_object(
      'backup_type', p_backup_type,
      'file_name', p_file_name,
      'status', p_status,
      'tables', p_table_counts
    ),
    'Manual offline backup generated and verified',
    p_user_id,
    NOW()
  );

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


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
ALTER TABLE material_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpg_cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpg_cylinder_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_wastage ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Permissive read and manage policies for all public tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated users full access" ON %I;', tbl);
    EXECUTE format('CREATE POLICY "Authenticated users full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public read access" ON %I;', tbl);
    EXECUTE format('CREATE POLICY "Public read access" ON %I FOR SELECT TO anon USING (true);', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public full access" ON %I;', tbl);
    EXECUTE format('CREATE POLICY "Public full access" ON %I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl);
  END LOOP;
END $$;

-- Grant ALL privileges to authenticated, anon, service_role
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

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
INSERT INTO product_prices (product_id, selling_price, commission_type, commission_value, effective_from)
SELECT id, 10.00, 'fixed', 2.00, NOW() FROM products WHERE sku = 'JK-SADA-01'
AND NOT EXISTS (SELECT 1 FROM product_prices WHERE product_id = products.id);

INSERT INTO product_prices (product_id, selling_price, commission_type, commission_value, effective_from)
SELECT id, 20.00, 'fixed', 4.00, NOW() FROM products WHERE sku = 'JK-RABRI-02'
AND NOT EXISTS (SELECT 1 FROM product_prices WHERE product_id = products.id);

INSERT INTO product_prices (product_id, selling_price, commission_type, commission_value, effective_from)
SELECT id, 30.00, 'fixed', 6.00, NOW() FROM products WHERE sku = 'JK-PREM-03'
AND NOT EXISTS (SELECT 1 FROM product_prices WHERE product_id = products.id);

INSERT INTO product_prices (product_id, selling_price, commission_type, commission_value, effective_from)
SELECT id, 50.00, 'fixed', 10.00, NOW() FROM products WHERE sku = 'JK-MATKA-04'
AND NOT EXISTS (SELECT 1 FROM product_prices WHERE product_id = products.id);

-- 8.4 Standard Carts
INSERT INTO carts (id, cart_code, cart_name, location, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'CART-01', 'Mirehchi Chowk Cart (ठेला 1)', 'Mirehchi Main Market Chauraha', true),
  ('d0000000-0000-0000-0000-000000000002', 'CART-02', 'Bus Stand Mobile Cart (ठेला 2)', 'Etah Road Bus Stand Point', true),
  ('d0000000-0000-0000-0000-000000000003', 'CART-03', 'Railway Station Cart (ठेla 3)', 'Railway Station Gate', true)
ON CONFLICT (cart_code) DO NOTHING;

-- 8.5 Standard Sellers
INSERT INTO sellers (seller_code, full_name, phone, address, default_cart_id, is_active, opening_balance)
VALUES
  ('SLR-001', 'Ramesh Kumar (रमेश कुमार)', '9876543210', 'Ward 4, Mirehchi, Etah', (SELECT id FROM carts WHERE cart_code = 'CART-01' LIMIT 1), true, 0.00),
  ('SLR-002', 'Suresh Chandra (सुरेश चन्द्र)', '9876543211', 'Station Road, Mirehchi, Etah', (SELECT id FROM carts WHERE cart_code = 'CART-02' LIMIT 1), true, 0.00)
ON CONFLICT (seller_code) DO NOTHING;

-- 8.6 Seller Stock Holding Locations
INSERT INTO stock_locations (location_type, name, seller_id, cart_id, is_active)
SELECT 'seller', 'Ramesh Kumar Cart Stock', s.id, c.id, true
FROM sellers s CROSS JOIN carts c
WHERE s.seller_code = 'SLR-001' AND c.cart_code = 'CART-01'
AND NOT EXISTS (SELECT 1 FROM stock_locations WHERE seller_id = s.id);

INSERT INTO stock_locations (location_type, name, seller_id, cart_id, is_active)
SELECT 'seller', 'Suresh Chandra Cart Stock', s.id, c.id, true
FROM sellers s CROSS JOIN carts c
WHERE s.seller_code = 'SLR-002' AND c.cart_code = 'CART-02'
AND NOT EXISTS (SELECT 1 FROM stock_locations WHERE seller_id = s.id);

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
  v_sada_prod UUID;
  v_rabri_prod UUID;
  v_prem_prod UUID;
  v_sada_rec UUID;
  v_rabri_rec UUID;
  v_prem_rec UUID;
  v_milk_id UUID;
  v_sugar_id UUID;
  v_khoya_id UUID;
  v_cashew_id UUID;
  v_pista_id UUID;
  v_almond_id UUID;
  v_cardamom_id UUID;
  v_saffron_id UUID;
  v_stick_id UUID;
  v_wrapper_id UUID;
BEGIN
  -- Resolve Product IDs
  SELECT id INTO v_sada_prod FROM products WHERE sku = 'JK-SADA-01' LIMIT 1;
  SELECT id INTO v_rabri_prod FROM products WHERE sku = 'JK-RABRI-02' LIMIT 1;
  SELECT id INTO v_prem_prod FROM products WHERE sku = 'JK-PREM-03' LIMIT 1;

  -- Resolve Ingredient IDs dynamically by code
  SELECT id INTO v_milk_id FROM ingredients WHERE code = 'ING-MILK' LIMIT 1;
  SELECT id INTO v_sugar_id FROM ingredients WHERE code = 'ING-SUGAR' LIMIT 1;
  SELECT id INTO v_khoya_id FROM ingredients WHERE code = 'ING-KHOYA' LIMIT 1;
  SELECT id INTO v_cashew_id FROM ingredients WHERE code = 'ING-CASHEW' LIMIT 1;
  SELECT id INTO v_pista_id FROM ingredients WHERE code = 'ING-PISTA' LIMIT 1;
  SELECT id INTO v_almond_id FROM ingredients WHERE code = 'ING-ALMOND' LIMIT 1;
  SELECT id INTO v_cardamom_id FROM ingredients WHERE code = 'ING-CARDAMOM' LIMIT 1;
  SELECT id INTO v_saffron_id FROM ingredients WHERE code = 'ING-SAFFRON' LIMIT 1;
  SELECT id INTO v_stick_id FROM ingredients WHERE code = 'ING-STICK' LIMIT 1;
  SELECT id INTO v_wrapper_id FROM ingredients WHERE code = 'ING-WRAPPER' LIMIT 1;

  -- 1. Sada Kulfi Standard Recipe (100 pcs)
  IF v_sada_prod IS NOT NULL THEN
    SELECT id INTO v_sada_rec FROM recipes WHERE product_id = v_sada_prod AND version_number = 1 LIMIT 1;
    
    UPDATE recipes SET status = 'archived', is_default = false 
    WHERE product_id = v_sada_prod;

    IF v_sada_rec IS NULL THEN
      INSERT INTO recipes (product_id, version_number, name, standard_output_pieces, expected_yield_pieces, status, is_default, default_overheads)
      VALUES (v_sada_prod, 1, 'Standard Sada 100 pcs', 100, 100, 'active', true, '{"gas":50,"direct_labour":60,"electricity":20,"transport":10,"other":10}'::jsonb)
      RETURNING id INTO v_sada_rec;
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

    DELETE FROM recipe_items WHERE recipe_id = v_sada_rec;

    IF v_milk_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_sada_rec, v_milk_id, 10, 'litre', 1); END IF;
    IF v_sugar_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_sada_rec, v_sugar_id, 1.2, 'kg', 2); END IF;
    IF v_khoya_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_sada_rec, v_khoya_id, 0.5, 'kg', 3); END IF;
    IF v_cardamom_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_sada_rec, v_cardamom_id, 0.015, 'kg', 4); END IF;
    IF v_stick_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_sada_rec, v_stick_id, 100, 'piece', 5); END IF;
    IF v_wrapper_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_sada_rec, v_wrapper_id, 100, 'piece', 6); END IF;
  END IF;

  -- 2. Rabri Kulfi Standard Recipe (100 pcs)
  IF v_rabri_prod IS NOT NULL THEN
    SELECT id INTO v_rabri_rec FROM recipes WHERE product_id = v_rabri_prod AND version_number = 1 LIMIT 1;
    
    UPDATE recipes SET status = 'archived', is_default = false 
    WHERE product_id = v_rabri_prod;

    IF v_rabri_rec IS NULL THEN
      INSERT INTO recipes (product_id, version_number, name, standard_output_pieces, expected_yield_pieces, status, is_default, default_overheads)
      VALUES (v_rabri_prod, 1, 'Standard Rabri 100 pcs', 100, 100, 'active', true, '{"gas":70,"direct_labour":80,"electricity":30,"transport":10,"other":10}'::jsonb)
      RETURNING id INTO v_rabri_rec;
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

    DELETE FROM recipe_items WHERE recipe_id = v_rabri_rec;

    IF v_milk_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rabri_rec, v_milk_id, 15, 'litre', 1); END IF;
    IF v_sugar_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rabri_rec, v_sugar_id, 1.5, 'kg', 2); END IF;
    IF v_khoya_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rabri_rec, v_khoya_id, 1.0, 'kg', 3); END IF;
    IF v_cashew_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rabri_rec, v_cashew_id, 0.2, 'kg', 4); END IF;
    IF v_pista_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rabri_rec, v_pista_id, 0.1, 'kg', 5); END IF;
    IF v_stick_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rabri_rec, v_stick_id, 100, 'piece', 6); END IF;
    IF v_wrapper_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_rabri_rec, v_wrapper_id, 100, 'piece', 7); END IF;
  END IF;

  -- 3. Premium Kulfi Standard Recipe (100 pcs)
  IF v_prem_prod IS NOT NULL THEN
    SELECT id INTO v_prem_rec FROM recipes WHERE product_id = v_prem_prod AND version_number = 1 LIMIT 1;
    
    UPDATE recipes SET status = 'archived', is_default = false 
    WHERE product_id = v_prem_prod;

    IF v_prem_rec IS NULL THEN
      INSERT INTO recipes (product_id, version_number, name, standard_output_pieces, expected_yield_pieces, status, is_default, default_overheads)
      VALUES (v_prem_prod, 1, 'Standard Premium 100 pcs', 100, 100, 'active', true, '{"gas":90,"direct_labour":100,"electricity":40,"transport":15,"other":15}'::jsonb)
      RETURNING id INTO v_prem_rec;
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

    DELETE FROM recipe_items WHERE recipe_id = v_prem_rec;

    IF v_milk_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_milk_id, 20, 'litre', 1); END IF;
    IF v_sugar_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_sugar_id, 2.0, 'kg', 2); END IF;
    IF v_khoya_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_khoya_id, 1.5, 'kg', 3); END IF;
    IF v_cashew_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_cashew_id, 0.3, 'kg', 4); END IF;
    IF v_pista_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_pista_id, 0.2, 'kg', 5); END IF;
    IF v_almond_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_almond_id, 0.3, 'kg', 6); END IF;
    IF v_saffron_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_saffron_id, 2, 'g', 7); END IF;
    IF v_stick_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_stick_id, 100, 'piece', 8); END IF;
    IF v_wrapper_id IS NOT NULL THEN INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit, sort_order) VALUES (v_prem_rec, v_wrapper_id, 100, 'piece', 9); END IF;
  END IF;
END $$;

-- 8.10 Standard Commercial LPG Cylinders
INSERT INTO lpg_cylinders (id, cylinder_code, cylinder_type, rated_gas_capacity, tare_weight, full_gross_weight, current_gross_weight, calculated_remaining_gas, remaining_percentage, status, is_active)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'LPG-01', 'commercial_19kg', 19.00, 15.20, 34.20, 34.20, 19.00, 100.00, 'in_use', true),
  ('30000000-0000-0000-0000-000000000002', 'LPG-02', 'commercial_19kg', 19.00, 15.40, 34.40, 34.40, 19.00, 100.00, 'full', true),
  ('30000000-0000-0000-0000-000000000003', 'LPG-03', 'commercial_19kg', 19.00, 15.10, 34.10, 34.10, 19.00, 100.00, 'full', true)
ON CONFLICT (cylinder_code) DO NOTHING;

-- 8.11 Default Authoritative Expense Heads
INSERT INTO expense_heads (
  id, code, name_en, name_hi, expense_group, calculation_mode, default_amount, due_day, start_date, notes, is_active, is_archived, sort_order
) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'EXP-RENT-01', 'Shop/Factory/Warehouse Rent', 'दुकान/कारखाना/गोदाम का किराया', 'monthly_fixed', 'manual', 15000.00, 5, CURRENT_DATE, 'Monthly lease for factory and warehouse', true, false, 1),
  ('e1000000-0000-0000-0000-000000000002', 'EXP-PERM-SAL-02', 'Permanent Employee Salary', 'स्थायी कर्मचारियों की salary', 'monthly_fixed', 'manual', 25000.00, 7, CURRENT_DATE, 'Monthly wages for permanent factory workers', true, false, 2),
  ('e1000000-0000-0000-0000-000000000003', 'EXP-OWNER-SAL-03', 'Owner/Manager Salary', 'Owner/Manager salary', 'monthly_fixed', 'manual', 20000.00, 10, CURRENT_DATE, 'Managerial compensation', true, false, 3),
  ('e1000000-0000-0000-0000-000000000004', 'EXP-INGR-PKG-04', 'Ingredients & Packaging', 'कच्चा माल व पैकेजिंग', 'variable_production', 'automatic', 0.00, 1, CURRENT_DATE, 'Auto-calculated from batch recipe consumption', true, false, 4),
  ('e1000000-0000-0000-0000-000000000005', 'EXP-LPG-ENERGY-05', 'LPG & Energy Consumption', 'LPG गैस व ऊर्जा', 'variable_production', 'automatic', 0.00, 1, CURRENT_DATE, 'Auto-calculated from cylinder readings and production', true, false, 5),
  ('e1000000-0000-0000-0000-000000000006', 'EXP-WATER-CLEAN-06', 'Water & Cleaning', 'पानी व सफाई', 'variable_production', 'manual', 1000.00, 15, CURRENT_DATE, 'Water supply and cleaning supplies', true, false, 6),
  ('e1000000-0000-0000-0000-000000000007', 'EXP-TEMP-LAB-07', 'Temporary Labour', 'अस्थायी मजदूरी', 'variable_production', 'manual', 0.00, 1, CURRENT_DATE, 'Daily / temporary packaging & helper wages', true, false, 7)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_hi = EXCLUDED.name_hi,
  expense_group = EXCLUDED.expense_group,
  calculation_mode = EXCLUDED.calculation_mode,
  notes = EXCLUDED.notes;

-- ============================================================================
-- 9. RELOAD SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

