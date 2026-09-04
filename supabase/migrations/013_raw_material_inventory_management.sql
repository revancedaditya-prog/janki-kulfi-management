-- Migration: 013_raw_material_inventory_management.sql
-- Description: Complete Raw Material Inventory Management System (Suppliers, Purchases, Lots, Raw Material Ledger, Physical Stock Counts, LPG Cylinders, Wastage, Atomic Production Consumption)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Extend Unit & Movement Enums
DO $$
BEGIN
  -- Unit Types
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'opening_stock';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'purchase_received';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'production_consumption';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'wastage';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'damage_spillage';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'supplier_return';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'internal_use';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'free_sample';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'stock_transfer';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'physical_count_correction';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'purchase_reversal';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'adjustment_reversal';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Suppliers Master Table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Extend Existing `ingredients` Table with Inventory Master Attributes
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(12,4) NOT NULL DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS reorder_quantity NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS track_expiry BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_lots BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_location TEXT DEFAULT 'Main Raw Material Store';

-- 4. Material Purchases Header Table
CREATE TABLE IF NOT EXISTS material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number TEXT UNIQUE NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash', -- cash, upi, bank_transfer, credit
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (credit_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  bill_image_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('draft', 'received', 'cancelled', 'reversed')),
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Material Purchase Items Table
CREATE TABLE IF NOT EXISTS material_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES material_purchases(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
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

-- 6. Inventory Lots for FEFO Expiry Tracking
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

-- 7. Authoritative Raw Material Ledger Movements Table
CREATE TABLE IF NOT EXISTS raw_material_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_location TEXT NOT NULL DEFAULT 'Supplier',
  destination_location TEXT NOT NULL DEFAULT 'Main Raw Material Store',
  quantity NUMERIC(12,3) NOT NULL, -- Positive for incoming to location, negative for outgoing/consumed
  base_unit TEXT NOT NULL,
  movement_type TEXT NOT NULL, -- opening_stock, purchase_received, production_consumption, wastage, damage_spillage, supplier_return, internal_use, free_sample, stock_transfer, physical_count_correction, purchase_reversal, production_reversal, adjustment_reversal
  reference_table TEXT, -- material_purchases, production_batches, physical_stock_counts, inventory_wastage, supplier_returns
  reference_id UUID,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  total_value_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  reversal_of_movement_id UUID REFERENCES raw_material_movements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Physical Stock Counts
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
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  app_stock NUMERIC(12,3) NOT NULL,
  physical_stock NUMERIC(12,3) NOT NULL CHECK (physical_stock >= 0),
  difference_quantity NUMERIC(12,3) NOT NULL,
  base_unit TEXT NOT NULL,
  unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  difference_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Dedicated LPG Cylinder Management Table
CREATE TABLE IF NOT EXISTS lpg_cylinders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cylinder_code TEXT UNIQUE NOT NULL, -- e.g. LPG-01
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  cylinder_type TEXT NOT NULL DEFAULT 'commercial_19kg' CHECK (cylinder_type IN ('commercial_19kg', 'domestic_14kg', 'other')),
  rated_gas_capacity NUMERIC(6,2) NOT NULL DEFAULT 19.00 CHECK (rated_gas_capacity > 0),
  tare_weight NUMERIC(6,2) NOT NULL CHECK (tare_weight > 0), -- TW printed on cylinder
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

-- 10. LPG Cylinder Reading Logs
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
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Inventory Wastage & Internal Use
CREATE TABLE IF NOT EXISTS inventory_wastage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wastage_number TEXT UNIQUE NOT NULL,
  wastage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  base_unit TEXT NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  total_loss_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  wastage_type TEXT NOT NULL CHECK (wastage_type IN ('spillage', 'expired', 'damaged_packaging', 'cleaning_test', 'personal_internal', 'sample_production', 'other')),
  reason TEXT NOT NULL,
  photo_url TEXT,
  recorded_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Supplier Returns
CREATE TABLE IF NOT EXISTS supplier_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT UNIQUE NOT NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES material_purchases(id) ON DELETE SET NULL,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
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

-- 13. Reorder Shopping List Tracking
CREATE TABLE IF NOT EXISTS reorder_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID UNIQUE NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  suggested_quantity NUMERIC(12,3) NOT NULL CHECK (suggested_quantity > 0),
  base_unit TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'ordered', 'received')),
  ordered_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Indexes for Rapid Aggregation & Querying
CREATE INDEX IF NOT EXISTS idx_rmm_ingredient ON raw_material_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_rmm_date ON raw_material_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_rmm_type ON raw_material_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_rmm_reference ON raw_material_movements(reference_table, reference_id);
CREATE INDEX IF NOT EXISTS idx_lots_ingredient ON inventory_lots(ingredient_id, status);
CREATE INDEX IF NOT EXISTS idx_lots_expiry ON inventory_lots(expiry_date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON material_purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON material_purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_cylinders_status ON lpg_cylinders(status);

-- 15. View: v_raw_material_stock (Authoritative Aggregated Stock)
CREATE OR REPLACE VIEW v_raw_material_stock AS
SELECT 
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
  i.track_expiry,
  i.track_lots,
  i.is_active,
  i.storage_location,
  i.preferred_supplier_id,
  s.name AS preferred_supplier_name,
  GREATEST(0, COALESCE(SUM(rmm.quantity), 0)) AS available_base_quantity,
  i.current_rate AS latest_purchase_rate,
  i.rate_unit,
  -- Calculate weighted average rate snapshot
  COALESCE(
    (
      SELECT rmm2.unit_cost_snapshot 
      FROM raw_material_movements rmm2 
      WHERE rmm2.ingredient_id = i.id AND rmm2.movement_type IN ('purchase_received', 'opening_stock')
      ORDER BY rmm2.movement_date DESC 
      LIMIT 1
    ), i.current_rate
  ) AS weighted_average_rate,
  -- Total Stock Valuation
  ROUND(
    GREATEST(0, COALESCE(SUM(rmm.quantity), 0)) * COALESCE(
      (
        SELECT rmm2.unit_cost_snapshot 
        FROM raw_material_movements rmm2 
        WHERE rmm2.ingredient_id = i.id AND rmm2.movement_type IN ('purchase_received', 'opening_stock')
        ORDER BY rmm2.movement_date DESC 
        LIMIT 1
      ), i.current_rate
    ), 2
  ) AS total_stock_value,
  -- Stock Status
  CASE 
    WHEN GREATEST(0, COALESCE(SUM(rmm.quantity), 0)) = 0 THEN 'out_of_stock'
    WHEN GREATEST(0, COALESCE(SUM(rmm.quantity), 0)) <= i.min_stock_level THEN 'low_stock'
    ELSE 'in_stock'
  END AS stock_status
FROM ingredients i
LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
LEFT JOIN raw_material_movements rmm ON i.id = rmm.ingredient_id
GROUP BY i.id, s.name;

-- 16. Stored Procedure: Confirm Material Purchase Transaction
CREATE OR REPLACE FUNCTION confirm_material_purchase_transaction(
  p_purchase_date DATE,
  p_supplier_id UUID,
  p_invoice_number TEXT,
  p_payment_method TEXT,
  p_paid_amount NUMERIC(12,2),
  p_credit_amount NUMERIC(12,2),
  p_bill_image_url TEXT,
  p_notes TEXT,
  p_items JSONB, -- array of { ingredient_id, purchased_quantity, purchase_unit, free_quantity, unit_price, discount, tax, allocated_charge, lot_number, manufacturing_date, expiry_date }
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_purchase_id UUID;
  v_purchase_number TEXT;
  v_item JSONB;
  v_ing RECORD;
  v_purchased_qty NUMERIC(12,3);
  v_free_qty NUMERIC(12,3);
  v_total_rec_qty NUMERIC(12,3);
  v_base_qty NUMERIC(12,3);
  v_unit_price NUMERIC(12,2);
  v_item_price NUMERIC(12,2);
  v_discount NUMERIC(12,2);
  v_tax NUMERIC(12,2);
  v_charge NUMERIC(12,2);
  v_net_item_cost NUMERIC(12,2);
  v_unit_acq_cost NUMERIC(12,4);
  v_total_purchase_cost NUMERIC(12,2) := 0.00;
  v_expense_id UUID := NULL;
  v_lot_id UUID;
  v_purchase_item_id UUID;
  v_curr_qty NUMERIC(12,3);
  v_curr_rate NUMERIC(12,4);
  v_new_wac NUMERIC(12,4);
BEGIN
  -- Generate Purchase Number (e.g. PUR-20260903-1234)
  v_purchase_number := 'PUR-' || TO_CHAR(p_purchase_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

  -- First calculate total purchase cost
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_purchased_qty := COALESCE((v_item->>'purchased_quantity')::NUMERIC, 0);
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);
    v_tax := COALESCE((v_item->>'tax')::NUMERIC, 0);
    v_charge := COALESCE((v_item->>'allocated_charge')::NUMERIC, 0);
    v_item_price := ROUND(v_purchased_qty * v_unit_price, 2);
    v_net_item_cost := v_item_price - v_discount + v_tax + v_charge;
    v_total_purchase_cost := v_total_purchase_cost + v_net_item_cost;
  END LOOP;

  -- Create Linked Expense Record (category = 'raw_materials') to avoid double counting
  IF v_total_purchase_cost > 0 AND p_paid_amount > 0 THEN
    INSERT INTO expenses (
      expense_date,
      category,
      amount,
      payment_method,
      paid_to,
      description,
      bill_url,
      created_by
    ) VALUES (
      p_purchase_date,
      'raw_materials',
      p_paid_amount,
      p_payment_method::payment_method,
      COALESCE((SELECT name FROM suppliers WHERE id = p_supplier_id), 'Raw Material Supplier'),
      'Material Purchase ' || v_purchase_number || ' (Invoice: ' || COALESCE(p_invoice_number, 'N/A') || ')',
      p_bill_image_url,
      p_user_id
    ) RETURNING id INTO v_expense_id;
  END IF;

  -- Create Purchase Header
  INSERT INTO material_purchases (
    purchase_number,
    purchase_date,
    supplier_id,
    invoice_number,
    payment_method,
    paid_amount,
    credit_amount,
    total_amount,
    bill_image_url,
    notes,
    status,
    expense_id,
    created_by
  ) VALUES (
    v_purchase_number,
    p_purchase_date,
    p_supplier_id,
    p_invoice_number,
    p_payment_method,
    COALESCE(p_paid_amount, v_total_purchase_cost),
    COALESCE(p_credit_amount, 0.00),
    v_total_purchase_cost,
    p_bill_image_url,
    p_notes,
    'received',
    v_expense_id,
    p_user_id
  ) RETURNING id INTO v_purchase_id;

  -- Process Line Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_ing FROM ingredients WHERE id = (v_item->>'ingredient_id')::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ingredient % not found', (v_item->>'ingredient_id');
    END IF;

    v_purchased_qty := COALESCE((v_item->>'purchased_quantity')::NUMERIC, 0);
    v_free_qty := COALESCE((v_item->>'free_quantity')::NUMERIC, 0);
    v_total_rec_qty := v_purchased_qty + v_free_qty;
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);
    v_tax := COALESCE((v_item->>'tax')::NUMERIC, 0);
    v_charge := COALESCE((v_item->>'allocated_charge')::NUMERIC, 0);
    v_item_price := ROUND(v_purchased_qty * v_unit_price, 2);
    v_net_item_cost := v_item_price - v_discount + v_tax + v_charge;

    -- Unit conversion to base unit
    v_base_qty := v_total_rec_qty * COALESCE(v_ing.conversion_factor, 1.0000);
    IF v_base_qty > 0 THEN
      v_unit_acq_cost := ROUND(v_net_item_cost / v_base_qty, 4);
    ELSE
      v_unit_acq_cost := 0.0000;
    END IF;

    -- Insert Purchase Line Item
    INSERT INTO material_purchase_items (
      purchase_id,
      ingredient_id,
      purchased_quantity,
      purchase_unit,
      free_quantity,
      total_received_quantity,
      base_quantity,
      base_unit,
      unit_price,
      item_price,
      discount,
      tax,
      allocated_charge,
      net_item_cost,
      unit_acquisition_cost,
      lot_number,
      manufacturing_date,
      expiry_date
    ) VALUES (
      v_purchase_id,
      v_ing.id,
      v_purchased_qty,
      COALESCE(v_item->>'purchase_unit', v_ing.purchase_unit),
      v_free_qty,
      v_total_rec_qty,
      v_base_qty,
      v_ing.base_unit,
      v_unit_price,
      v_item_price,
      v_discount,
      v_tax,
      v_charge,
      v_net_item_cost,
      v_unit_acq_cost,
      v_item->>'lot_number',
      (v_item->>'manufacturing_date')::DATE,
      (v_item->>'expiry_date')::DATE
    ) RETURNING id INTO v_purchase_item_id;

    -- Create Inventory Lot if lot or expiry tracking enabled
    IF v_ing.track_lots OR v_ing.track_expiry OR (v_item->>'lot_number') IS NOT NULL THEN
      INSERT INTO inventory_lots (
        ingredient_id,
        lot_number,
        purchase_item_id,
        supplier_id,
        initial_quantity,
        remaining_quantity,
        base_unit,
        unit_cost,
        manufacturing_date,
        expiry_date,
        status
      ) VALUES (
        v_ing.id,
        COALESCE(v_item->>'lot_number', 'LOT-' || TO_CHAR(p_purchase_date, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*1000)::TEXT, 3, '0')),
        v_purchase_item_id,
        p_supplier_id,
        v_base_qty,
        v_base_qty,
        v_ing.base_unit,
        v_unit_acq_cost,
        (v_item->>'manufacturing_date')::DATE,
        (v_item->>'expiry_date')::DATE,
        'active'
      ) RETURNING id INTO v_lot_id;
    ELSE
      v_lot_id := NULL;
    END IF;

    -- Insert Raw Material Ledger Stock-In Movement
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
      lot_id,
      unit_cost_snapshot,
      total_value_snapshot,
      reason,
      created_by
    ) VALUES (
      v_ing.id,
      NOW(),
      COALESCE((SELECT name FROM suppliers WHERE id = p_supplier_id), 'Supplier'),
      v_ing.storage_location,
      v_base_qty,
      v_ing.base_unit,
      'purchase_received',
      'material_purchases',
      v_purchase_id,
      v_lot_id,
      v_unit_acq_cost,
      v_net_item_cost,
      'Purchase ' || v_purchase_number,
      p_user_id
    );

    -- Calculate New Weighted-Average Cost
    SELECT COALESCE(SUM(quantity), 0) INTO v_curr_qty 
    FROM raw_material_movements 
    WHERE ingredient_id = v_ing.id AND id NOT IN (SELECT id FROM raw_material_movements WHERE reference_id = v_purchase_id);
    v_curr_qty := GREATEST(0, v_curr_qty);

    v_curr_rate := COALESCE(v_ing.current_rate, 0.00);
    IF (v_curr_qty + v_base_qty) > 0 THEN
      v_new_wac := ROUND(((v_curr_qty * v_curr_rate) + (v_base_qty * v_unit_acq_cost)) / (v_curr_qty + v_base_qty), 2);
    ELSE
      v_new_wac := v_unit_acq_cost;
    END IF;

    -- Update Ingredient Master Rate & Snapshot
    UPDATE ingredients 
    SET current_rate = v_new_wac,
        rate_unit = v_ing.base_unit,
        updated_at = NOW()
    WHERE id = v_ing.id;

    INSERT INTO ingredient_prices (
      ingredient_id,
      rate,
      unit,
      effective_from,
      created_by
    ) VALUES (
      v_ing.id,
      v_new_wac,
      v_ing.base_unit,
      NOW(),
      p_user_id
    );
  END LOOP;

  -- Audit Log
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    change_reason,
    user_id
  ) VALUES (
    'material_purchases',
    v_purchase_id,
    'CONFIRM_MATERIAL_PURCHASE',
    jsonb_build_object('purchase_number', v_purchase_number, 'total_amount', v_total_purchase_cost),
    'Confirmed raw material purchase',
    p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_number,
    'total_amount', v_total_purchase_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 17. Stored Procedure: Atomic Production Completion with Raw Material Consumption
CREATE OR REPLACE FUNCTION complete_production_with_raw_materials_transaction(
  p_batch_id UUID,
  p_raw_materials JSONB, -- array of { ingredient_id, quantity_used, unit, lot_id }
  p_allow_emergency_override BOOLEAN DEFAULT false,
  p_override_reason TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_mat JSONB;
  v_ing RECORD;
  v_used_qty NUMERIC(12,3);
  v_base_qty NUMERIC(12,3);
  v_avail_qty NUMERIC(12,3);
  v_shortage NUMERIC(12,3);
  v_unit_rate NUMERIC(12,4);
  v_item_cost NUMERIC(12,2);
  v_total_raw_cost NUMERIC(12,2) := 0.00;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
BEGIN
  -- Lock Batch
  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found';
  END IF;

  IF v_batch.status = 'completed' THEN
    RAISE EXCEPTION 'Production batch is already completed';
  END IF;

  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');

  -- 1. Check Ingredient Stock Availability
  FOR v_mat IN SELECT * FROM jsonb_array_elements(p_raw_materials) LOOP
    SELECT * INTO v_ing FROM ingredients WHERE id = (v_mat->>'ingredient_id')::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ingredient % not found', (v_mat->>'ingredient_id');
    END IF;

    v_used_qty := COALESCE((v_mat->>'quantity_used')::NUMERIC, 0);
    v_base_qty := v_used_qty * COALESCE(v_ing.conversion_factor, 1.0000);

    -- Calculate current available stock from ledger
    SELECT GREATEST(0, COALESCE(SUM(quantity), 0)) INTO v_avail_qty
    FROM raw_material_movements
    WHERE ingredient_id = v_ing.id;

    IF v_avail_qty < v_base_qty THEN
      v_shortage := v_base_qty - v_avail_qty;
      IF NOT p_allow_emergency_override THEN
        RAISE EXCEPTION 'Insufficient stock for % (%). Available: % %, Required: % %, Shortage: % %',
          v_ing.name_hi, v_ing.name_en, v_avail_qty, v_ing.base_unit, v_base_qty, v_ing.base_unit, v_shortage, v_ing.base_unit;
      END IF;
    END IF;
  END LOOP;

  -- 2. Deduct Raw Materials and Create Consumption Movements
  FOR v_mat IN SELECT * FROM jsonb_array_elements(p_raw_materials) LOOP
    SELECT * INTO v_ing FROM ingredients WHERE id = (v_mat->>'ingredient_id')::UUID;
    v_used_qty := COALESCE((v_mat->>'quantity_used')::NUMERIC, 0);
    v_base_qty := v_used_qty * COALESCE(v_ing.conversion_factor, 1.0000);
    v_unit_rate := COALESCE(v_ing.current_rate, 0.00);
    v_item_cost := ROUND(v_base_qty * v_unit_rate, 2);
    v_total_raw_cost := v_total_raw_cost + v_item_cost;

    -- Record consumption movement (negative quantity)
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
      lot_id,
      unit_cost_snapshot,
      total_value_snapshot,
      reason,
      created_by
    ) VALUES (
      v_ing.id,
      NOW(),
      v_ing.storage_location,
      'Production Floor',
      -v_base_qty, -- Deduct
      v_ing.base_unit,
      'production_consumption',
      'production_batches',
      p_batch_id,
      (v_mat->>'lot_id')::UUID,
      v_unit_rate,
      v_item_cost,
      'Production Batch ' || v_batch.batch_number || CASE WHEN p_allow_emergency_override THEN ' (Emergency Override: ' || COALESCE(p_override_reason, 'None') || ')' ELSE '' END,
      p_user_id
    );

    -- Save permanent snapshot to production_batch_ingredients
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
      p_batch_id,
      v_ing.id,
      v_ing.name_hi || ' (' || v_ing.name_en || ')',
      v_used_qty,
      COALESCE(v_mat->>'unit', v_ing.base_unit),
      v_base_qty,
      v_unit_rate,
      v_ing.rate_unit,
      v_item_cost,
      v_ing.category = 'packaging'
    );
  END LOOP;

  -- 3. Increase Finished Kulfi Stock in Freezer
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
        v_prod_loc_id,
        v_freezer_loc_id,
        v_item.saleable_quantity,
        'production_completed',
        'production_batches',
        p_batch_id,
        'Production Batch ' || v_batch.batch_number,
        p_user_id
      );
    END IF;
  END LOOP;

  -- 4. Mark Batch Completed
  UPDATE production_batches
  SET status = 'completed',
      total_ingredient_cost = GREATEST(COALESCE(total_ingredient_cost, 0.00), v_total_raw_cost),
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Production and raw material consumption completed atomically',
    'total_raw_material_cost', v_total_raw_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 18. Row-Level Security (RLS)
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpg_cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpg_cylinder_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_wastage ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_list ENABLE ROW LEVEL SECURITY;

-- Grant RLS Policies for Authenticated Production Workers and Owners
DO $$
BEGIN
  -- Read access for production & owners
  DROP POLICY IF EXISTS "Production workers and owners can view inventory tables" ON raw_material_movements;
  CREATE POLICY "Production workers and owners can view inventory tables"
    ON raw_material_movements FOR SELECT TO authenticated
    USING (is_production_or_owner());

  DROP POLICY IF EXISTS "Owners can manage raw material movements" ON raw_material_movements;
  CREATE POLICY "Owners can manage raw material movements"
    ON raw_material_movements FOR ALL TO authenticated
    USING (is_owner());

  -- Suppliers
  DROP POLICY IF EXISTS "Production workers and owners can view suppliers" ON suppliers;
  CREATE POLICY "Production workers and owners can view suppliers"
    ON suppliers FOR SELECT TO authenticated
    USING (is_production_or_owner());

  DROP POLICY IF EXISTS "Owners can manage suppliers" ON suppliers;
  CREATE POLICY "Owners can manage suppliers"
    ON suppliers FOR ALL TO authenticated
    USING (is_owner());

  -- LPG Cylinders
  DROP POLICY IF EXISTS "Production workers and owners can view LPG cylinders" ON lpg_cylinders;
  CREATE POLICY "Production workers and owners can view LPG cylinders"
    ON lpg_cylinders FOR SELECT TO authenticated
    USING (is_production_or_owner());

  DROP POLICY IF EXISTS "Production workers and owners can record LPG readings" ON lpg_cylinder_readings;
  CREATE POLICY "Production workers and owners can record LPG readings"
    ON lpg_cylinder_readings FOR ALL TO authenticated
    USING (is_production_or_owner());
END $$;
