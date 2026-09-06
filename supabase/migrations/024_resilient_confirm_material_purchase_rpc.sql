-- Migration 024: Resilient confirm_material_purchase_transaction RPC & Permissions
-- Allows TEXT or UUID parameters for maximum PostgREST compatibility

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
BEGIN
  -- Safe UUID conversions
  IF p_supplier_id IS NOT NULL AND p_supplier_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supplier_uuid := p_supplier_id::UUID;
    IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_supplier_uuid) THEN
      v_supplier_uuid := NULL;
    END IF;
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  v_purchase_number := 'PUR-' || TO_CHAR(COALESCE(p_purchase_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

  -- Calculate total cost
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

  -- 1. Insert Material Purchase Header
  INSERT INTO material_purchases (
    purchase_number, purchase_date, supplier_id, invoice_number, payment_method,
    total_amount, discount_amount, tax_amount, transport_charges,
    paid_amount, credit_amount, status, bill_image_url, notes, created_by
  ) VALUES (
    v_purchase_number,
    COALESCE(p_purchase_date, CURRENT_DATE),
    v_supplier_uuid,
    p_invoice_number,
    COALESCE(p_payment_method, 'cash'),
    v_total_purchase_cost,
    0, 0, 0,
    COALESCE(p_paid_amount, 0),
    COALESCE(p_credit_amount, 0),
    'received',
    p_bill_image_url,
    p_notes,
    v_user_uuid
  ) RETURNING id INTO v_purchase_id;

  -- 2. Insert Items & Movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'ingredient_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_ing_uuid := (v_item->>'ingredient_id')::UUID;
    ELSE
      SELECT id INTO v_ing_uuid FROM ingredients WHERE id::TEXT = (v_item->>'ingredient_id') OR code ILIKE (v_item->>'ingredient_id') LIMIT 1;
    END IF;

    IF v_ing_uuid IS NOT NULL THEN
      SELECT * INTO v_ing FROM ingredients WHERE id = v_ing_uuid;
      
      v_purchased_qty := COALESCE((v_item->>'purchased_quantity')::NUMERIC, 0);
      v_free_qty := COALESCE((v_item->>'free_quantity')::NUMERIC, 0);
      v_total_rec_qty := v_purchased_qty + v_free_qty;
      v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
      v_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);
      v_tax := COALESCE((v_item->>'tax')::NUMERIC, 0);
      v_charge := COALESCE((v_item->>'allocated_charge')::NUMERIC, 0);
      v_item_price := ROUND(v_purchased_qty * v_unit_price, 2);
      v_net_item_cost := v_item_price - v_discount + v_tax + v_charge;
      v_unit_acq_cost := CASE WHEN v_total_rec_qty > 0 THEN ROUND(v_net_item_cost / v_total_rec_qty, 4) ELSE v_unit_price END;

      INSERT INTO material_purchase_items (
        purchase_id, ingredient_id, purchased_quantity, purchase_unit,
        free_quantity, unit_price, discount_amount, tax_amount, allocated_charge,
        item_total_cost, lot_number, manufacturing_date, expiry_date
      ) VALUES (
        v_purchase_id, v_ing_uuid, v_purchased_qty, COALESCE(v_item->>'purchase_unit', v_ing.base_unit),
        v_free_qty, v_unit_price, v_discount, v_tax, v_charge,
        v_net_item_cost, v_item->>'lot_number',
        NULLIF(v_item->>'manufacturing_date', '')::DATE,
        NULLIF(v_item->>'expiry_date', '')::DATE
      );

      -- Stock In Movement
      INSERT INTO raw_material_movements (
        ingredient_id, movement_type, quantity, base_unit,
        unit_cost_snapshot, total_value_snapshot, reference_table, reference_id,
        movement_date, source_location, destination_location, reason, created_by
      ) VALUES (
        v_ing_uuid, 'purchase_received', v_total_rec_qty, v_ing.base_unit,
        v_unit_acq_cost, v_net_item_cost, 'material_purchases', v_purchase_id,
        COALESCE(p_purchase_date, CURRENT_DATE), 'Supplier', 'Main Store',
        'Material purchase: ' || v_purchase_number, v_user_uuid
      );

      -- Update current rate on ingredient
      UPDATE ingredients SET current_rate = v_unit_price WHERE id = v_ing_uuid;
    END IF;
  END LOOP;

  -- 3. If paid amount > 0, insert into expenses
  IF COALESCE(p_paid_amount, 0) > 0 THEN
    INSERT INTO expenses (
      expense_date, category, amount, payment_method, paid_to, description, bill_url, created_by
    ) VALUES (
      COALESCE(p_purchase_date, CURRENT_DATE), 'raw_materials', p_paid_amount,
      CASE WHEN p_payment_method = 'credit' THEN 'cash' ELSE p_payment_method END,
      'Material Supplier', 'Raw material purchase ' || v_purchase_number, p_bill_image_url, v_user_uuid
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'purchase_number', v_purchase_number,
    'total_amount', v_total_purchase_cost,
    'message', 'सामग्री खरीद सफलतापूर्वक दर्ज की गई'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to public roles
GRANT EXECUTE ON FUNCTION public.confirm_material_purchase_transaction TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
