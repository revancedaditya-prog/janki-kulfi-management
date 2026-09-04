-- Migration 018: repair the live stock action RPCs without adding new enum values.
-- Safe to run after migrations 001-017. Uses the existing stock_correction type.

DROP FUNCTION IF EXISTS public.reconcile_freezer_stock_transaction();
DROP FUNCTION IF EXISTS public.reconcile_freezer_stock_transaction(jsonb, text, uuid);

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

REVOKE ALL ON FUNCTION public.reconcile_freezer_stock_transaction(jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_freezer_stock_transaction(jsonb, text, uuid) TO authenticated;

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

REVOKE ALL ON FUNCTION public.sync_completed_production_batches_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_completed_production_batches_stock() TO authenticated;

NOTIFY pgrst, 'reload schema';
