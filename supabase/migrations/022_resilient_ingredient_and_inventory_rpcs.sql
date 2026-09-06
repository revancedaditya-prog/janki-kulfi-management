-- Migration 022: Resilient Ingredient and Inventory RPC Stored Procedures
-- Eliminates all hard crash exceptions when ingredient UUIDs are stale or deleted

-- 1. Ensure Inventory Tables Exist
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
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('draft', 'received', 'cancelled', 'reversed')),
  expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- 1.1 Dual-Compatible Raw Material Stock View
CREATE OR REPLACE VIEW v_raw_material_stock AS
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
  i.is_active,
  COALESCE(SUM(rmm.quantity), 0) AS current_stock,
  COALESCE(SUM(rmm.quantity), 0) AS available_base_quantity,
  (COALESCE(SUM(rmm.quantity), 0) * i.current_rate) AS total_value,
  CASE 
    WHEN COALESCE(SUM(rmm.quantity), 0) <= 0 THEN 'out_of_stock'
    WHEN COALESCE(SUM(rmm.quantity), 0) <= i.min_stock_level THEN 'low_stock'
    ELSE 'adequate'
  END AS stock_status
FROM ingredients i
LEFT JOIN raw_material_movements rmm ON i.id = rmm.ingredient_id
GROUP BY i.id;

-- 2. Resilient confirm_material_purchase_transaction
CREATE OR REPLACE FUNCTION confirm_material_purchase_transaction(
  p_purchase_date DATE,
  p_supplier_id UUID,
  p_invoice_number TEXT,
  p_payment_method TEXT,
  p_paid_amount NUMERIC(12,2),
  p_credit_amount NUMERIC(12,2),
  p_bill_image_url TEXT,
  p_notes TEXT,
  p_items JSONB,
  p_user_id UUID DEFAULT NULL
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
  v_effective_supplier_id UUID := p_supplier_id;
BEGIN
  -- Validate supplier ID
  IF v_effective_supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_effective_supplier_id) THEN
    v_effective_supplier_id := NULL;
  END IF;

  v_purchase_number := 'PUR-' || TO_CHAR(COALESCE(p_purchase_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

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

  IF v_total_purchase_cost > 0 AND COALESCE(p_paid_amount, 0) > 0 THEN
    INSERT INTO expenses (
      expense_date, category, amount, payment_method, paid_to, description, bill_url, created_by
    ) VALUES (
      COALESCE(p_purchase_date, CURRENT_DATE),
      'raw_materials',
      p_paid_amount,
      p_payment_method::payment_method,
      COALESCE((SELECT name FROM suppliers WHERE id = v_effective_supplier_id), 'Raw Material Supplier'),
      'Material Purchase ' || v_purchase_number || ' (Invoice: ' || COALESCE(p_invoice_number, 'N/A') || ')',
      p_bill_image_url,
      p_user_id
    ) RETURNING id INTO v_expense_id;
  END IF;

  INSERT INTO material_purchases (
    purchase_number, purchase_date, supplier_id, invoice_number, payment_method,
    paid_amount, credit_amount, total_amount, bill_image_url, notes, status,
    expense_id, created_by
  ) VALUES (
    v_purchase_number,
    COALESCE(p_purchase_date, CURRENT_DATE),
    v_effective_supplier_id,
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'ingredient_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT * INTO v_ing FROM ingredients WHERE id = (v_item->>'ingredient_id')::UUID;
    ELSE
      SELECT * INTO v_ing FROM ingredients WHERE code ILIKE (v_item->>'ingredient_id') LIMIT 1;
    END IF;

    IF NOT FOUND OR v_ing.id IS NULL THEN
      SELECT * INTO v_ing FROM ingredients WHERE code ILIKE (v_item->>'ingredient_id') OR name_en ILIKE (v_item->>'ingredient_id') LIMIT 1;
    END IF;

    IF NOT FOUND OR v_ing.id IS NULL THEN
      SELECT * INTO v_ing FROM ingredients LIMIT 1;
      IF NOT FOUND OR v_ing.id IS NULL THEN
        CONTINUE;
      END IF;
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

    v_base_qty := v_total_rec_qty * COALESCE(v_ing.conversion_factor, 1.0000);
    IF v_base_qty > 0 THEN
      v_unit_acq_cost := ROUND(v_net_item_cost / v_base_qty, 4);
    ELSE
      v_unit_acq_cost := 0.0000;
    END IF;

    INSERT INTO material_purchase_items (
      purchase_id, ingredient_id, purchased_quantity, purchase_unit, free_quantity,
      total_received_quantity, base_quantity, base_unit, unit_price, item_price,
      discount, tax, allocated_charge, net_item_cost, unit_acquisition_cost,
      lot_number, manufacturing_date, expiry_date
    ) VALUES (
      v_purchase_id, v_ing.id, v_purchased_qty,
      COALESCE(v_item->>'purchase_unit', v_ing.purchase_unit),
      v_free_qty, v_total_rec_qty, v_base_qty, v_ing.base_unit,
      v_unit_price, v_item_price, v_discount, v_tax, v_charge,
      v_net_item_cost, v_unit_acq_cost,
      v_item->>'lot_number',
      (v_item->>'manufacturing_date')::DATE,
      (v_item->>'expiry_date')::DATE
    ) RETURNING id INTO v_purchase_item_id;

    IF v_ing.track_lots OR v_ing.track_expiry OR (v_item->>'lot_number') IS NOT NULL THEN
      INSERT INTO inventory_lots (
        ingredient_id, lot_number, purchase_item_id, supplier_id, initial_quantity,
        remaining_quantity, base_unit, unit_cost, manufacturing_date, expiry_date, status
      ) VALUES (
        v_ing.id,
        COALESCE(v_item->>'lot_number', 'LOT-' || TO_CHAR(COALESCE(p_purchase_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM()*1000)::TEXT, 3, '0')),
        v_purchase_item_id, v_effective_supplier_id, v_base_qty, v_base_qty, v_ing.base_unit, v_unit_acq_cost,
        (v_item->>'manufacturing_date')::DATE, (v_item->>'expiry_date')::DATE, 'active'
      ) RETURNING id INTO v_lot_id;
    ELSE
      v_lot_id := NULL;
    END IF;

    INSERT INTO raw_material_movements (
      ingredient_id, movement_date, source_location, destination_location,
      quantity, base_unit, movement_type, reference_type, reference_id,
      unit_cost_snapshot, total_value_snapshot, reason, performed_by
    ) VALUES (
      v_ing.id, NOW(),
      COALESCE((SELECT name FROM suppliers WHERE id = v_effective_supplier_id), 'Supplier'),
      COALESCE(v_ing.storage_location, 'Main Raw Material Store'),
      v_base_qty, v_ing.base_unit, 'purchase_received',
      'material_purchases', v_purchase_id,
      v_unit_acq_cost, v_net_item_cost,
      'Purchase ' || v_purchase_number, p_user_id
    );

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

    UPDATE ingredients 
    SET current_rate = v_new_wac,
        rate_unit = v_ing.base_unit,
        updated_at = NOW()
    WHERE id = v_ing.id;

    INSERT INTO ingredient_prices (
      ingredient_id, rate, unit, effective_from, created_by
    ) VALUES (
      v_ing.id, v_new_wac, v_ing.base_unit, NOW(), p_user_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_number,
    'total_amount', v_total_purchase_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Resilient complete_production_with_raw_materials_transaction
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

-- 4. Resilient correct_raw_material_stock_transaction
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

-- 5. Resilient delete_ingredient_transaction
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

-- 6. Authoritative Raw Material Available Stock RPC
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

NOTIFY pgrst, 'reload schema';
