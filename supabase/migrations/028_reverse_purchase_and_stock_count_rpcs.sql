-- ============================================================================
-- Migration 028: Material Purchase Reversal & Physical Stock Count Approval RPCs
-- ============================================================================

-- 1. Reverse Material Purchase Transaction
DROP FUNCTION IF EXISTS reverse_material_purchase_transaction(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION reverse_material_purchase_transaction(
  p_purchase_id UUID,
  p_reason TEXT DEFAULT 'Purchase cancelled',
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_purch RECORD;
  v_item RECORD;
  v_user_uuid UUID := NULL;
  v_qty NUMERIC;
  v_cost NUMERIC;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  SELECT * INTO v_purch FROM material_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material purchase not found';
  END IF;

  IF v_purch.status = 'cancelled' THEN
    RAISE EXCEPTION 'Purchase is already cancelled';
  END IF;

  -- 1. Update purchase status
  UPDATE material_purchases
  SET status = 'cancelled',
      notes = COALESCE(notes, '') || ' [Cancelled: ' || COALESCE(p_reason, 'No reason') || ']',
      updated_at = NOW()
  WHERE id = p_purchase_id;

  -- 2. Reverse stock movements for each item
  FOR v_item IN SELECT * FROM material_purchase_items WHERE purchase_id = p_purchase_id LOOP
    v_qty := COALESCE(v_item.purchased_quantity, 0) + COALESCE(v_item.free_quantity, 0);
    v_cost := COALESCE(v_item.item_total_cost, v_item.net_item_cost, v_qty * COALESCE(v_item.unit_price, 0));

    INSERT INTO raw_material_movements (
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
      notes,
      created_by
    ) VALUES (
      v_item.ingredient_id,
      'purchase_reversal',
      -ABS(v_qty),
      COALESCE(v_item.purchase_unit, 'unit'),
      v_item.unit_price,
      -ABS(v_cost),
      'material_purchases',
      p_purchase_id,
      CURRENT_DATE,
      'Main Store',
      COALESCE(p_reason, 'Purchase cancelled/reversed'),
      v_user_uuid
    );
  END LOOP;

  -- 3. Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'material_purchases',
    p_purchase_id,
    'REVERSE_PURCHASE',
    row_to_json(v_purch)::jsonb,
    jsonb_build_object('status', 'cancelled', 'reason', p_reason),
    p_reason,
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', p_purchase_id,
    'message', 'खरीद प्रविष्टि सफलतापूर्वक रद्द कर दी गई'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Approve Physical Stock Count Transaction
DROP FUNCTION IF EXISTS approve_physical_stock_count_transaction(UUID, TEXT);
DROP FUNCTION IF EXISTS approve_physical_stock_count_transaction(UUID, UUID);

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

-- 3. Permissions & Cache Reload
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
