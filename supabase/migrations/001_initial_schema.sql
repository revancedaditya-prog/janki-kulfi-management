-- Janki Kulfi Management Schema Migration 001
-- Initial schema, tables, constraints, indexes, views

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('owner', 'production_worker', 'seller');
CREATE TYPE commission_type AS ENUM ('fixed', 'percentage');
CREATE TYPE batch_status AS ENUM ('draft', 'completed', 'cancelled');
CREATE TYPE issue_status AS ENUM ('draft', 'issued', 'partially_settled', 'settled', 'cancelled');
CREATE TYPE settlement_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected');
CREATE TYPE expense_category AS ENUM (
  'ingredients',
  'electricity',
  'generator_fuel',
  'wages',
  'seller_commission',
  'packaging',
  'transport',
  'repairs',
  'rent',
  'marketing',
  'other'
);
CREATE TYPE payment_method AS ENUM ('cash', 'upi', 'bank_transfer', 'credit');
CREATE TYPE expense_status AS ENUM ('active', 'voided');
CREATE TYPE stock_location_type AS ENUM ('production', 'main_freezer', 'seller', 'returned', 'damaged', 'complimentary');
CREATE TYPE stock_movement_type AS ENUM (
  'production_completed',
  'seller_issued',
  'seller_returned',
  'damaged',
  'complimentary',
  'stock_correction',
  'cancellation_reversal'
);
CREATE TYPE closing_status AS ENUM ('open', 'closed', 'reopened');

-- 1. Profiles Table (Linked to auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'seller',
  preferred_language TEXT NOT NULL DEFAULT 'hi' CHECK (preferred_language IN ('en', 'hi')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Products Table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Product Prices Table
CREATE TABLE product_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  selling_price NUMERIC(12,2) NOT NULL CHECK (selling_price >= 0),
  commission_type commission_type NOT NULL DEFAULT 'fixed',
  commission_value NUMERIC(12,2) NOT NULL CHECK (commission_value >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_effective_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- 4. Carts Table
CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_code TEXT UNIQUE NOT NULL,
  cart_name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Sellers Table
CREATE TABLE sellers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  user_profile_id UUID UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
  default_cart_id UUID REFERENCES carts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Stock Locations Table
CREATE TABLE stock_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_type stock_location_type NOT NULL,
  name TEXT NOT NULL,
  seller_id UUID REFERENCES sellers(id) ON DELETE CASCADE,
  cart_id UUID REFERENCES carts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 7. Production Batches Table
CREATE TABLE production_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_number TEXT UNIQUE NOT NULL,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status batch_status NOT NULL DEFAULT 'draft',
  total_ingredient_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_ingredient_cost >= 0),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Production Items Table
CREATE TABLE production_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  produced_quantity INTEGER NOT NULL CHECK (produced_quantity >= 0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  saleable_quantity INTEGER NOT NULL CHECK (saleable_quantity >= 0),
  allocated_ingredient_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (allocated_ingredient_cost >= 0),
  unit_production_cost NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (unit_production_cost >= 0),
  notes TEXT,
  CONSTRAINT check_damage_lte_produced CHECK (damaged_quantity <= produced_quantity),
  CONSTRAINT check_saleable_equals_calc CHECK (saleable_quantity = produced_quantity - damaged_quantity)
);

-- 9. Seller Issues Table
CREATE TABLE seller_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_number TEXT UNIQUE NOT NULL,
  seller_id UUID NOT NULL REFERENCES sellers(id),
  cart_id UUID REFERENCES carts(id),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status issue_status NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Seller Issue Items Table
CREATE TABLE seller_issue_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_issue_id UUID NOT NULL REFERENCES seller_issues(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  issued_quantity INTEGER NOT NULL CHECK (issued_quantity > 0),
  unit_selling_price_snapshot NUMERIC(12,2) NOT NULL CHECK (unit_selling_price_snapshot >= 0),
  commission_type_snapshot TEXT NOT NULL DEFAULT 'fixed',
  commission_value_snapshot NUMERIC(12,2) NOT NULL CHECK (commission_value_snapshot >= 0)
);

-- 11. Seller Settlements Table
CREATE TABLE seller_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_number TEXT UNIQUE NOT NULL,
  seller_issue_id UUID NOT NULL REFERENCES seller_issues(id),
  seller_id UUID NOT NULL REFERENCES sellers(id),
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status settlement_status NOT NULL DEFAULT 'draft',
  cash_received NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (cash_received >= 0),
  upi_received NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (upi_received >= 0),
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (credit_amount >= 0),
  gross_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (gross_sales >= 0),
  total_commission NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_commission >= 0),
  expected_collection NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (expected_collection >= 0),
  total_received NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_received >= 0),
  outstanding_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (outstanding_amount >= 0),
  shortage_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (shortage_amount >= 0),
  notes TEXT,
  submitted_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Settlement Items Table
CREATE TABLE settlement_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id UUID NOT NULL REFERENCES seller_settlements(id) ON DELETE CASCADE,
  seller_issue_item_id UUID NOT NULL REFERENCES seller_issue_items(id),
  product_id UUID NOT NULL REFERENCES products(id),
  issued_quantity_snapshot INTEGER NOT NULL CHECK (issued_quantity_snapshot > 0),
  returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  complimentary_quantity INTEGER NOT NULL DEFAULT 0 CHECK (complimentary_quantity >= 0),
  sold_quantity INTEGER NOT NULL CHECK (sold_quantity >= 0),
  selling_price_snapshot NUMERIC(12,2) NOT NULL CHECK (selling_price_snapshot >= 0),
  gross_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (gross_sales >= 0),
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (commission_amount >= 0),
  damage_reason TEXT,
  complimentary_reason TEXT,
  CONSTRAINT check_items_not_exceed_issue CHECK (returned_quantity + damaged_quantity + complimentary_quantity <= issued_quantity_snapshot),
  CONSTRAINT check_sold_equals_calc CHECK (sold_quantity = issued_quantity_snapshot - returned_quantity - damaged_quantity - complimentary_quantity)
);

-- 13. Expenses Table
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category expense_category NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method payment_method NOT NULL DEFAULT 'cash',
  description TEXT NOT NULL,
  vendor_name TEXT,
  bill_image_path TEXT,
  status expense_status NOT NULL DEFAULT 'active',
  void_reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_void_reason_if_voided CHECK (status != 'voided' OR (void_reason IS NOT NULL AND length(trim(void_reason)) > 0))
);

-- 14. Stock Movements Table (Authoritative Inventory Ledger)
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_id UUID NOT NULL REFERENCES products(id),
  source_location_id UUID REFERENCES stock_locations(id),
  destination_location_id UUID REFERENCES stock_locations(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  movement_type stock_movement_type NOT NULL,
  reference_table TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_movement_has_location CHECK (source_location_id IS NOT NULL OR destination_location_id IS NOT NULL),
  CONSTRAINT check_different_locations CHECK (source_location_id IS DISTINCT FROM destination_location_id)
);

-- 15. Daily Closings Table
CREATE TABLE daily_closings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_date DATE UNIQUE NOT NULL,
  status closing_status NOT NULL DEFAULT 'closed',
  total_produced INTEGER NOT NULL DEFAULT 0,
  total_sold INTEGER NOT NULL DEFAULT 0,
  total_returned INTEGER NOT NULL DEFAULT 0,
  total_damaged INTEGER NOT NULL DEFAULT 0,
  total_complimentary INTEGER NOT NULL DEFAULT 0,
  gross_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_commission NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  net_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  cash_received NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  upi_received NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_sales NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_expenses NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  estimated_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  closing_stock_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  closed_by UUID REFERENCES profiles(id),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reopened_by UUID REFERENCES profiles(id),
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT
);

-- 16. Audit Logs Table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  reason TEXT,
  performed_by UUID REFERENCES profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_product_prices_product ON product_prices(product_id);
CREATE INDEX idx_product_prices_effective ON product_prices(product_id, effective_from, effective_to);
CREATE INDEX idx_production_batches_date ON production_batches(production_date);
CREATE INDEX idx_production_batches_status ON production_batches(status);
CREATE INDEX idx_production_items_batch ON production_items(batch_id);
CREATE INDEX idx_seller_issues_seller ON seller_issues(seller_id);
CREATE INDEX idx_seller_issues_date ON seller_issues(issue_date);
CREATE INDEX idx_seller_issues_status ON seller_issues(status);
CREATE INDEX idx_seller_settlements_issue ON seller_settlements(seller_issue_id);
CREATE INDEX idx_seller_settlements_seller ON seller_settlements(seller_id);
CREATE INDEX idx_seller_settlements_status ON seller_settlements(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_source ON stock_movements(source_location_id);
CREATE INDEX idx_stock_movements_dest ON stock_movements(destination_location_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(movement_date);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_daily_closings_date ON daily_closings(business_date);

-- View: Freezer Stock (Authoritative Current Stock in Main Freezer)
CREATE OR REPLACE VIEW v_freezer_stock AS
SELECT 
  p.id AS product_id,
  p.name_en,
  p.name_hi,
  p.sku,
  p.is_active,
  COALESCE(
    (
      SELECT SUM(sm.quantity)
      FROM stock_movements sm
      JOIN stock_locations dl ON sm.destination_location_id = dl.id
      WHERE sm.product_id = p.id AND dl.location_type = 'main_freezer'
    ), 0
  ) - COALESCE(
    (
      SELECT SUM(sm.quantity)
      FROM stock_movements sm
      JOIN stock_locations sl ON sm.source_location_id = sl.id
      WHERE sm.product_id = p.id AND sl.location_type = 'main_freezer'
    ), 0
  ) AS available_quantity
FROM products p;

-- View: Seller Current Stock in Field
CREATE OR REPLACE VIEW v_seller_stock AS
SELECT
  s.id AS seller_id,
  s.full_name AS seller_name,
  s.seller_code,
  p.id AS product_id,
  p.name_en,
  p.name_hi,
  COALESCE(
    (
      SELECT SUM(sm.quantity)
      FROM stock_movements sm
      JOIN stock_locations dl ON sm.destination_location_id = dl.id
      WHERE sm.product_id = p.id AND dl.seller_id = s.id
    ), 0
  ) - COALESCE(
    (
      SELECT SUM(sm.quantity)
      FROM stock_movements sm
      JOIN stock_locations sl ON sm.source_location_id = sl.id
      WHERE sm.product_id = p.id AND sl.seller_id = s.id
    ), 0
  ) AS current_held_quantity
FROM sellers s
CROSS JOIN products p
WHERE s.is_active = true AND p.is_active = true;
