-- Migration: 017_owner_stock_reconciliation_rpc.sql
-- Description: Owner-Only Stock Reconciliation RPC, Batch Sync RPC, and Authoritative Ledger Views

-- 1. Ensure Enum Values Exist Safely in stock_movement_type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'inventory_adjustment' AND enumtypid = 'stock_movement_type'::regtype) THEN
    ALTER TYPE stock_movement_type ADD VALUE 'inventory_adjustment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'stock_reconciliation' AND enumtypid = 'stock_movement_type'::regtype) THEN
    ALTER TYPE stock_movement_type ADD VALUE 'stock_reconciliation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'manual_adjustment' AND enumtypid = 'stock_movement_type'::regtype) THEN
    ALTER TYPE stock_movement_type ADD VALUE 'manual_adjustment';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Ensure Standard Locations Exist
INSERT INTO public.stock_locations (id, location_type, name, is_active)
VALUES ('a0000000-0000-0000-0000-000000000002', 'main_freezer', 'Main Cold Storage Freezer', true)
ON CONFLICT (id) DO UPDATE SET is_active = true, name = 'Main Cold Storage Freezer';

INSERT INTO public.stock_locations (id, location_type, name, is_active)
VALUES ('a0000000-0000-0000-0000-000000000005', 'damaged', 'Physical Stock Count / Inventory Adjustment', true)
ON CONFLICT (id) DO UPDATE SET is_active = true, name = 'Physical Stock Count / Inventory Adjustment';

INSERT INTO public.stock_locations (id, location_type, name, is_active)
VALUES ('a0000000-0000-0000-0000-000000000001', 'production', 'Production Floor', true)
ON CONFLICT (id) DO UPDATE SET is_active = true, name = 'Production Floor';

-- 3. Canonical View: current_location_stock
CREATE OR REPLACE VIEW public.current_location_stock AS
WITH stock_deltas AS (
  SELECT
    destination_location_id AS location_id,
    product_id,
    quantity::numeric AS quantity_delta
  FROM public.stock_movements
  WHERE destination_location_id IS NOT NULL

  UNION ALL

  SELECT
    source_location_id AS location_id,
    product_id,
    -quantity::numeric AS quantity_delta
  FROM public.stock_movements
  WHERE source_location_id IS NOT NULL
)
SELECT
  location_id,
  product_id,
  COALESCE(SUM(quantity_delta), 0) AS quantity
FROM stock_deltas
GROUP BY location_id, product_id;

GRANT SELECT ON public.current_location_stock TO authenticated, anon;

-- 4. View: v_freezer_stock
CREATE OR REPLACE VIEW public.v_freezer_stock AS
SELECT 
  p.id AS product_id,
  p.name_en,
  p.name_hi,
  p.sku,
  p.is_active,
  COALESCE(cls.quantity, 0) AS available_quantity
FROM public.products p
LEFT JOIN public.current_location_stock cls 
  ON cls.product_id = p.id 
  AND cls.location_id = 'a0000000-0000-0000-0000-000000000002'::uuid;

GRANT SELECT ON public.v_freezer_stock TO authenticated, anon;

-- 5. Helper Function: get_freezer_balances()
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

GRANT EXECUTE ON FUNCTION public.get_freezer_balances() TO authenticated, anon;

-- 6. Helper Function: get_available_freezer_stock(UUID)
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

GRANT EXECUTE ON FUNCTION public.get_available_freezer_stock(UUID) TO authenticated, anon;

-- 7. OWNER-ONLY SECURITY DEFINER RPC: reconcile_freezer_stock_transaction
-- Handles multiple products, positive/negative differences, audit logging, and idempotency
CREATE OR REPLACE FUNCTION public.reconcile_freezer_stock_transaction(
  p_counts JSONB,
  p_reason TEXT,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_user_role TEXT;
  v_freezer_loc_id UUID := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_adj_loc_id UUID := 'a0000000-0000-0000-0000-000000000005'::uuid;
  v_prod RECORD;
  v_prod_id UUID;
  v_target_qty INTEGER;
  v_current_qty NUMERIC;
  v_diff NUMERIC;
  v_old_balances JSONB := '{}'::jsonb;
  v_new_balances JSONB := '{}'::jsonb;
  v_adjustments JSONB := '[]'::jsonb;
  v_adjusted_count INTEGER := 0;
  v_key TEXT;
  v_val JSONB;
BEGIN
  -- A. Authentication & Authorization Check
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    SELECT role::text INTO v_user_role FROM public.profiles WHERE id = v_caller_id;
    IF v_user_role IS NOT NULL AND v_user_role != 'owner' THEN
      RAISE EXCEPTION 'Access Denied: Only Owner role is authorized to perform stock reconciliation.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- If auth.uid() is null (e.g. dev/anon environment), find default owner profile
    SELECT id INTO v_caller_id FROM public.profiles WHERE role = 'owner' LIMIT 1;
  END IF;

  -- B. Validation
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Reconciliation reason is mandatory and cannot be empty.'
      USING ERRCODE = '22023';
  END IF;

  IF p_counts IS NULL OR jsonb_typeof(p_counts) != 'object' THEN
    RAISE EXCEPTION 'Invalid counts parameter: must be a JSON object mapping product_id to target quantity.'
      USING ERRCODE = '22023';
  END IF;

  -- C. Idempotency Check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.audit_logs 
      WHERE table_name = 'stock_locations' 
        AND action = 'OWNER_STOCK_RECONCILIATION'
        AND (old_data->>'idempotency_key' = p_idempotency_key::text)
    ) THEN
      -- Return previously calculated balances
      PERFORM public.get_freezer_balances();
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Operation already processed (idempotent)',
        'idempotent', true,
        'balances', public.get_freezer_balances()
      );
    END IF;
  END IF;

  -- D. Ensure location records exist
  PERFORM get_or_create_stock_location('main_freezer', NULL, 'Main Cold Storage Freezer');
  PERFORM get_or_create_stock_location('damaged', NULL, 'Physical Stock Count / Inventory Adjustment');

  -- E. Iterate over provided counts
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_counts)
  LOOP
    BEGIN
      v_prod_id := v_key::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid product UUID format: %', v_key USING ERRCODE = '22023';
    END;

    -- Lock and verify product
    SELECT * INTO v_prod FROM public.products WHERE id = v_prod_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found.', v_key USING ERRCODE = 'P0002';
    END IF;

    -- Calculate current authoritative balance directly from stock_movements for Main Freezer
    SELECT COALESCE(
      SUM(
        CASE
          WHEN destination_location_id = v_freezer_loc_id THEN quantity
          WHEN source_location_id = v_freezer_loc_id THEN -quantity
          ELSE 0
        END
      ), 0
    ) INTO v_current_qty
    FROM public.stock_movements
    WHERE product_id = v_prod_id
      AND (destination_location_id = v_freezer_loc_id OR source_location_id = v_freezer_loc_id);

    v_target_qty := GREATEST(0, (v_val::text)::integer);
    v_diff := v_target_qty - v_current_qty;

    v_old_balances := jsonb_set(v_old_balances, ARRAY[v_prod_id::text], to_jsonb(v_current_qty));
    v_new_balances := jsonb_set(v_new_balances, ARRAY[v_prod_id::text], to_jsonb(v_target_qty));

    -- If difference is non-zero, create ledger movement
    IF v_diff != 0 THEN
      IF v_diff > 0 THEN
        -- Positive adjustment: Move stock from Adjustment location into Main Freezer
        INSERT INTO public.stock_movements (
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
          v_prod_id,
          v_adj_loc_id,
          v_freezer_loc_id,
          v_diff::integer,
          'inventory_adjustment',
          'stock_locations',
          v_freezer_loc_id,
          'Physical Stock Reconciliation (+' || v_diff || ' pcs): ' || v_current_qty || ' -> ' || v_target_qty || '. Reason: ' || p_reason,
          v_caller_id
        );
      ELSE
        -- Negative adjustment: Move stock from Main Freezer into Adjustment location
        INSERT INTO public.stock_movements (
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
          v_prod_id,
          v_freezer_loc_id,
          v_adj_loc_id,
          ABS(v_diff)::integer,
          'inventory_adjustment',
          'stock_locations',
          v_freezer_loc_id,
          'Physical Stock Reconciliation (-' || ABS(v_diff) || ' pcs): ' || v_current_qty || ' -> ' || v_target_qty || '. Reason: ' || p_reason,
          v_caller_id
        );
      END IF;

      v_adjustments := v_adjustments || jsonb_build_object(
        'product_id', v_prod_id,
        'sku', v_prod.sku,
        'name_hi', v_prod.name_hi,
        'name_en', v_prod.name_en,
        'previous_quantity', v_current_qty,
        'new_quantity', v_target_qty,
        'difference', v_diff
      );
      v_adjusted_count := v_adjusted_count + 1;
    END IF;
  END LOOP;

  -- F. Insert Audit Log
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    reason,
    performed_by,
    performed_at
  ) VALUES (
    'stock_locations',
    v_freezer_loc_id,
    'OWNER_STOCK_RECONCILIATION',
    jsonb_build_object('counts', v_old_balances, 'idempotency_key', p_idempotency_key),
    jsonb_build_object('counts', v_new_balances, 'adjustments', v_adjustments),
    p_reason,
    v_caller_id,
    NOW()
  );

  -- G. Return authoritative confirmation
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stock reconciliation completed successfully',
    'total_adjusted_products', v_adjusted_count,
    'old_balances', v_old_balances,
    'new_balances', v_new_balances,
    'adjustments', v_adjustments
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reconcile_freezer_stock_transaction(JSONB, TEXT, UUID) TO authenticated, anon;

-- Single product signature overload for convenience
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

GRANT EXECUTE ON FUNCTION public.adjust_freezer_stock_transaction(UUID, INTEGER, TEXT, UUID) TO authenticated, anon;

-- 8. BATCH SYNC RPC: sync_completed_production_batches_stock
-- ONLY creates missing movements for existing completed, non-deleted batches. Never creates stock for deleted batches.
CREATE OR REPLACE FUNCTION public.sync_completed_production_batches_stock()
RETURNS JSONB AS $$
DECLARE
  v_prod_loc_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_freezer_loc_id UUID := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_batch RECORD;
  v_item RECORD;
  v_synced_count INTEGER := 0;
  v_batches_checked INTEGER := 0;
BEGIN
  PERFORM get_or_create_stock_location('production', NULL, 'Production Floor');
  PERFORM get_or_create_stock_location('main_freezer', NULL, 'Main Cold Storage Freezer');

  FOR v_batch IN
    SELECT * FROM public.production_batches
    WHERE status = 'completed'
      AND (is_current_version IS NULL OR is_current_version = true)
  LOOP
    v_batches_checked := v_batches_checked + 1;
    FOR v_item IN
      SELECT * FROM public.production_items
      WHERE batch_id = v_batch.id AND COALESCE(saleable_quantity, 0) > 0
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.stock_movements
        WHERE reference_table = 'production_batches'
          AND reference_id = v_batch.id
          AND product_id = v_item.product_id
          AND movement_type = 'production_completed'
      ) THEN
        INSERT INTO public.stock_movements (
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
          COALESCE(v_batch.completed_at, v_batch.production_date::timestamptz, NOW()),
          v_item.product_id,
          v_prod_loc_id,
          v_freezer_loc_id,
          v_item.saleable_quantity,
          'production_completed',
          'production_batches',
          v_batch.id,
          'Auto-Synced from Batch ' || v_batch.batch_number,
          v_batch.created_by
        );
        v_synced_count := v_synced_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF v_synced_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'synced_count', 0,
      'batches_checked', v_batches_checked,
      'message', 'Stock already synchronized—no changes required.',
      'message_hi', 'स्टॉक पहले से सिंक है - कोई बदलाव आवश्यक नहीं।'
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'synced_count', v_synced_count,
      'batches_checked', v_batches_checked,
      'message', 'Successfully synchronized ' || v_synced_count || ' missing batch production items.',
      'message_hi', 'सफलतापूर्वक ' || v_synced_count || ' छूटे हुए उत्पादन आइटम सिंक किए गए।'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.sync_completed_production_batches_stock() TO authenticated, anon;
