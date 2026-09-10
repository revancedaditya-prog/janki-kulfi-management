-- ============================================================================
-- Migration 031: Authoritative Material Purchase Atomic RPC & Cardamom/Badam Stock Repair
-- ============================================================================

-- 1. Ensure idempotency_key column exists on material_purchases
ALTER TABLE IF EXISTS public.material_purchases 
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_material_purchases_idempotency_key'
  ) THEN
    ALTER TABLE public.material_purchases 
      ADD CONSTRAINT uq_material_purchases_idempotency_key UNIQUE (idempotency_key);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Drop existing function signatures to ensure clean reload
DROP FUNCTION IF EXISTS public.confirm_material_purchase_atomic(DATE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, UUID, TEXT);
DROP FUNCTION IF EXISTS public.confirm_material_purchase_atomic(DATE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT);

-- 3. Atomic Material Purchase RPC Function
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

  -- 1. Check idempotency: If this purchase was already recorded with this key, return it safely
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

  -- 2. Resolve User ID and verify authorization
  IF auth.uid() IS NOT NULL THEN
    v_user_uuid := auth.uid();
  ELSIF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  -- Verify user exists in profiles; if not, use fallback owner or null
  IF v_user_uuid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_uuid) THEN
      SELECT id INTO v_user_uuid FROM public.profiles WHERE role = 'owner' LIMIT 1;
      IF v_user_uuid IS NULL THEN
        SELECT id INTO v_user_uuid FROM public.profiles LIMIT 1;
      END IF;
    END IF;
  ELSE
    SELECT id INTO v_user_uuid FROM public.profiles WHERE role = 'owner' LIMIT 1;
    IF v_user_uuid IS NULL THEN
      SELECT id INTO v_user_uuid FROM public.profiles LIMIT 1;
    END IF;
  END IF;

  -- 3. Resolve Supplier ID
  IF p_supplier_id IS NOT NULL AND p_supplier_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supplier_uuid := p_supplier_id::UUID;
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = v_supplier_uuid) THEN
      v_supplier_uuid := NULL;
    END IF;
  END IF;

  -- Validate line items count
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one purchase item is required (कम से कम एक सामग्री आवश्यक है)';
  END IF;

  -- 4. Validate all items and compute total cost
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

  -- 5. Generate formatted purchase number: PUR-YYYYMMDD-XXXX
  v_purchase_number := 'PUR-' || TO_CHAR(COALESCE(p_purchase_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

  -- 6. Insert Purchase Header
  INSERT INTO public.material_purchases (
    purchase_number,
    purchase_date,
    supplier_id,
    invoice_number,
    payment_method,
    total_amount,
    paid_amount,
    credit_amount,
    status,
    bill_image_url,
    notes,
    idempotency_key,
    created_by
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

  -- 7. Insert Line Items & Authoritative Positive Stock Movements
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

    -- A. Insert Purchase Item
    INSERT INTO public.material_purchase_items (
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
      v_ing_uuid,
      v_purchased_qty,
      COALESCE(v_item->>'purchase_unit', v_ing.base_unit),
      v_free_qty,
      v_total_rec_qty,
      v_total_rec_qty,
      v_ing.base_unit,
      v_unit_price,
      v_item_price,
      v_discount,
      v_tax,
      v_charge,
      v_net_item_cost,
      v_unit_acq_cost,
      v_item->>'lot_number',
      NULLIF(v_item->>'manufacturing_date', '')::DATE,
      NULLIF(v_item->>'expiry_date', '')::DATE
    );

    -- B. Insert Authoritative Positive Stock-In Movement
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
      v_ing_uuid,
      'purchase_received',
      v_total_rec_qty,
      v_ing.base_unit,
      v_unit_acq_cost,
      v_net_item_cost,
      'material_purchases',
      v_purchase_id,
      COALESCE(p_purchase_date, CURRENT_DATE),
      'Supplier',
      'Main Store',
      'Material purchase: ' || v_purchase_number,
      v_user_uuid
    );

    -- C. Update Current Purchase Rate on Ingredient
    UPDATE public.ingredients 
    SET current_rate = v_unit_price,
        updated_at = NOW()
    WHERE id = v_ing_uuid;

    -- D. Calculate new live balance for returning
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

  -- 8. Create Linked Expense if paid_amount > 0
  IF COALESCE(p_paid_amount, 0) > 0 THEN
    INSERT INTO public.expenses (
      expense_date,
      category,
      amount,
      payment_method,
      paid_to,
      description,
      bill_url,
      created_by
    ) VALUES (
      COALESCE(p_purchase_date, CURRENT_DATE),
      'raw_materials',
      p_paid_amount,
      CASE WHEN p_payment_method = 'credit' THEN 'cash' ELSE p_payment_method END,
      COALESCE((SELECT name FROM public.suppliers WHERE id = v_supplier_uuid), 'Material Supplier'),
      'Raw material purchase ' || v_purchase_number,
      p_bill_image_url,
      v_user_uuid
    );
  END IF;

  -- 9. Log Audit Entry
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    new_data,
    reason,
    performed_by
  ) VALUES (
    'material_purchases',
    v_purchase_id,
    'CREATE_MATERIAL_PURCHASE',
    jsonb_build_object(
      'purchase_number', v_purchase_number,
      'total_amount', v_total_purchase_cost,
      'items_count', jsonb_array_length(p_items)
    ),
    'Received raw material purchase ' || v_purchase_number,
    v_user_uuid
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

-- Backward compatibility wrapper for confirm_material_purchase_transaction
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

-- 4. Authoritative Canonical View for Raw Material Balances
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
  i.current_rate,
  i.current_rate AS latest_purchase_rate,
  i.rate_unit,
  i.min_stock_level,
  i.reorder_quantity,
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
  ROUND(COALESCE(SUM(rmm.quantity), 0) * COALESCE(i.current_rate, 0), 2) AS stock_value,
  ROUND(COALESCE(SUM(rmm.quantity), 0) * COALESCE(i.current_rate, 0), 2) AS total_value,
  CASE 
    WHEN COALESCE(SUM(rmm.quantity), 0) <= 0 THEN 'out_of_stock'
    WHEN COALESCE(SUM(rmm.quantity), 0) <= i.min_stock_level THEN 'low_stock'
    ELSE 'adequate'
  END AS stock_status
FROM public.ingredients i
LEFT JOIN public.raw_material_movements rmm
  ON rmm.ingredient_id = i.id
GROUP BY
  i.id;

CREATE OR REPLACE VIEW public.v_raw_material_stock AS
SELECT * FROM public.current_raw_material_stock;

-- 5. Idempotent Backfill & Reconciliation for PUR-20260910-9676 (Cardamom), PUR-20260909-4978 (Badam), and any Orphaned Received Purchases
DO $$
DECLARE
  r_purch RECORD;
  r_item RECORD;
  v_ing_uuid UUID;
  v_ing_rate NUMERIC(12,2);
  v_linked_mov_id UUID;
  v_corr_mov_id UUID;
  v_qty NUMERIC(12,3);
  v_cost NUMERIC(12,2);
  v_reconciled_count INTEGER := 0;
  v_reclassified_count INTEGER := 0;
BEGIN
  FOR r_purch IN 
    SELECT p.id, p.purchase_number, p.purchase_date, p.created_by, p.status
    FROM public.material_purchases p
    WHERE p.status IN ('received', 'completed')
    ORDER BY p.purchase_date ASC
  LOOP
    FOR r_item IN
      SELECT pi.id AS item_id, pi.ingredient_id, pi.purchased_quantity, pi.free_quantity, 
             pi.purchase_unit, pi.unit_price, pi.net_item_cost
      FROM public.material_purchase_items pi
      WHERE pi.purchase_id = r_purch.id
    LOOP
      v_ing_uuid := r_item.ingredient_id;
      v_qty := COALESCE(r_item.purchased_quantity, 0) + COALESCE(r_item.free_quantity, 0);
      v_cost := COALESCE(r_item.net_item_cost, v_qty * COALESCE(r_item.unit_price, 0));

      IF v_qty > 0 THEN
        -- A. Check if a movement is already linked to this purchase
        SELECT id INTO v_linked_mov_id
        FROM public.raw_material_movements
        WHERE reference_table = 'material_purchases'
          AND reference_id = r_purch.id
          AND ingredient_id = v_ing_uuid
        LIMIT 1;

        IF v_linked_mov_id IS NULL THEN
          -- B. Check if a manual stock correction was created for this exact quantity (to avoid double-counting BADAM)
          SELECT id INTO v_corr_mov_id
          FROM public.raw_material_movements
          WHERE ingredient_id = v_ing_uuid
            AND movement_type = 'physical_count_correction'
            AND ABS(quantity - v_qty) < 0.001
            AND reference_id IS NULL
          ORDER BY movement_date DESC
          LIMIT 1;

          IF v_corr_mov_id IS NOT NULL THEN
            -- Link and reclassify the manual correction to this purchase so stock does not double!
            UPDATE public.raw_material_movements
            SET movement_type = 'purchase_received',
                reference_table = 'material_purchases',
                reference_id = r_purch.id,
                unit_cost_snapshot = COALESCE(r_item.unit_price, unit_cost_snapshot),
                total_value_snapshot = v_cost,
                reason = 'Linked manual stock correction to purchase ' || r_purch.purchase_number
            WHERE id = v_corr_mov_id;

            v_reclassified_count := v_reclassified_count + 1;
          ELSE
            -- No manual correction was made (e.g. Cardamom PUR-20260910-9676); create the missing positive movement
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
              v_ing_uuid,
              'purchase_received',
              v_qty,
              COALESCE(r_item.purchase_unit, (SELECT base_unit FROM public.ingredients WHERE id = v_ing_uuid), 'kg'),
              COALESCE(r_item.unit_price, 0.00),
              v_cost,
              'material_purchases',
              r_purch.id,
              r_purch.purchase_date,
              'Supplier',
              'Main Store',
              'Reconciled missing purchase movement for ' || r_purch.purchase_number,
              r_purch.created_by
            );

            v_reconciled_count := v_reconciled_count + 1;
          END IF;

          -- Update ingredient current_rate if needed
          SELECT current_rate INTO v_ing_rate FROM public.ingredients WHERE id = v_ing_uuid;
          IF v_ing_rate IS NULL OR v_ing_rate <= 0 THEN
            UPDATE public.ingredients 
            SET current_rate = COALESCE(r_item.unit_price, 0),
                updated_at = NOW()
            WHERE id = v_ing_uuid;
          END IF;

          -- Log audit record
          INSERT INTO public.audit_logs (
            table_name, record_id, action, new_data, reason, performed_by
          ) VALUES (
            'raw_material_movements',
            r_purch.id,
            'RECONCILE_PURCHASE_STOCK',
            jsonb_build_object(
              'purchase_number', r_purch.purchase_number,
              'ingredient_id', v_ing_uuid,
              'quantity', v_qty,
              'was_reclassified', (v_corr_mov_id IS NOT NULL)
            ),
            'Idempotent reconciliation of purchase stock movement',
            r_purch.created_by
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Reconciliation completed: % missing movement(s) inserted, % manual correction(s) reclassified.', v_reconciled_count, v_reclassified_count;
END $$;

-- 6. Grant Permissions and Notify Schema Reload
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_material_purchase_atomic TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_material_purchase_transaction TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_material_purchase_transaction TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
