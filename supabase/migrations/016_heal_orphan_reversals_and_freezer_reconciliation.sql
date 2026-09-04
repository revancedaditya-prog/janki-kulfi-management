-- Migration: 016_heal_orphan_reversals_and_freezer_reconciliation.sql
-- Description: Self-healing reconciliation for orphan reversals, negative freezer deficits, and precise stock adjustments

CREATE OR REPLACE FUNCTION public.adjust_freezer_stock_transaction(
  p_product_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT DEFAULT 'Manual Adjustment',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_freezer_loc_id UUID;
  v_adj_loc_id UUID;
  v_current_qty NUMERIC := 0;
  v_target_qty NUMERIC;
  v_diff NUMERIC;
  v_product RECORD;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_adj_loc_id := get_or_create_stock_location('damaged', NULL, 'Inventory Adjustment');

  -- Get exact signed balance from canonical view (do not clamp to 0)
  SELECT COALESCE(quantity, 0) INTO v_current_qty
  FROM public.current_location_stock
  WHERE location_id = v_freezer_loc_id
    AND product_id = p_product_id;

  v_target_qty := GREATEST(0, p_new_quantity)::numeric;
  v_diff := v_target_qty - v_current_qty;

  IF v_diff = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'previous_quantity', v_current_qty,
      'new_quantity', v_target_qty,
      'difference', 0,
      'message', 'No change in stock'
    );
  END IF;

  IF v_diff > 0 THEN
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
      v_adj_loc_id,
      v_freezer_loc_id,
      v_diff,
      'manual_adjustment',
      'stock_locations',
      v_freezer_loc_id,
      'Freezer stock adjusted (+' || v_diff || ' pcs): ' || v_current_qty || ' -> ' || v_target_qty || '. Reason: ' || COALESCE(p_reason, 'Manual Adjustment'),
      p_user_id
    );
  ELSE
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
      v_freezer_loc_id,
      v_adj_loc_id,
      ABS(v_diff),
      'manual_adjustment',
      'stock_locations',
      v_freezer_loc_id,
      'Freezer stock adjusted (-' || ABS(v_diff) || ' pcs): ' || v_current_qty || ' -> ' || v_target_qty || '. Reason: ' || COALESCE(p_reason, 'Manual Adjustment'),
      p_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'previous_quantity', v_current_qty,
    'new_quantity', v_target_qty,
    'difference', v_diff,
    'message', 'Freezer stock successfully updated'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.adjust_freezer_stock_transaction(UUID, INTEGER, TEXT, UUID) TO authenticated, anon;

-- Auto-Reconcile with orphan reversal repair and negative deficit healing
CREATE OR REPLACE FUNCTION public.reconcile_freezer_stock_transaction()
RETURNS JSONB AS $$
DECLARE
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_adj_loc_id UUID;
  v_batch RECORD;
  v_item RECORD;
  v_issue RECORD;
  v_issue_item RECORD;
  v_reversal RECORD;
  v_neg RECORD;
  v_synced_batches INTEGER := 0;
  v_synced_issues INTEGER := 0;
  v_healed_reversals INTEGER := 0;
  v_healed_deficits INTEGER := 0;
  v_balances JSONB;
BEGIN
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_adj_loc_id := get_or_create_stock_location('damaged', NULL, 'Inventory Adjustment');

  -- A. Reconcile Completed Production Batches
  FOR v_batch IN 
    SELECT * FROM production_batches 
    WHERE status = 'completed' AND (is_current_version IS NULL OR is_current_version = true)
  LOOP
    FOR v_item IN 
      SELECT * FROM production_items 
      WHERE batch_id = v_batch.id AND COALESCE(saleable_quantity, 0) > 0
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM stock_movements
        WHERE reference_table = 'production_batches'
          AND reference_id = v_batch.id
          AND product_id = v_item.product_id
          AND movement_type = 'production_completed'
      ) THEN
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
          COALESCE(v_batch.completed_at, v_batch.created_at, NOW()),
          v_item.product_id,
          v_prod_loc_id,
          v_freezer_loc_id,
          v_item.saleable_quantity,
          'production_completed',
          'production_batches',
          v_batch.id,
          'Auto-Synced from Batch ' || v_batch.batch_number,
          NULL
        );
        v_synced_batches := v_synced_batches + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- B. Heal Orphan Production Reversals
  -- If a batch reversal exists without matching production_completed, insert the base completion so net is 0
  FOR v_reversal IN
    SELECT sm.* 
    FROM stock_movements sm
    WHERE sm.movement_type = 'production_reversal'
      AND sm.reference_table = 'production_batches'
      AND sm.reference_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements sm_comp
        WHERE sm_comp.reference_table = 'production_batches'
          AND sm_comp.reference_id = sm.reference_id
          AND sm_comp.product_id = sm.product_id
          AND sm_comp.movement_type = 'production_completed'
      )
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
      notes,
      created_by
    ) VALUES (
      v_reversal.movement_date,
      v_reversal.product_id,
      v_prod_loc_id,
      v_freezer_loc_id,
      v_reversal.quantity,
      'production_completed',
      'production_batches',
      v_reversal.reference_id,
      'Auto-Reconciled base production for deleted batch reversal',
      v_reversal.created_by
    );
    v_healed_reversals := v_healed_reversals + 1;
  END LOOP;

  -- C. Reconcile Active Stock Issues
  FOR v_issue IN 
    SELECT * FROM seller_issues 
    WHERE status IN ('issued', 'settled', 'partially_settled') AND (is_current_version IS NULL OR is_current_version = true)
  LOOP
    v_seller_loc_id := get_or_create_stock_location('seller', v_issue.seller_id, 'Seller Cart');
    FOR v_issue_item IN 
      SELECT * FROM seller_issue_items 
      WHERE seller_issue_id = v_issue.id AND COALESCE(issued_quantity, 0) > 0
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM stock_movements
        WHERE reference_table = 'seller_issues'
          AND reference_id = v_issue.id
          AND product_id = v_issue_item.product_id
          AND movement_type = 'seller_issued'
      ) THEN
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
          COALESCE(v_issue.issued_at, v_issue.created_at, NOW()),
          v_issue_item.product_id,
          v_freezer_loc_id,
          v_seller_loc_id,
          v_issue_item.issued_quantity,
          'seller_issued',
          'seller_issues',
          v_issue.id,
          'Auto-Synced from Issue ' || v_issue.issue_number,
          NULL
        );
        v_synced_issues := v_synced_issues + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- D. Heal Any Remaining Negative Deficit in Main Freezer
  FOR v_neg IN
    SELECT product_id, quantity
    FROM public.current_location_stock
    WHERE location_id = v_freezer_loc_id AND quantity < 0
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
      notes,
      created_by
    ) VALUES (
      NOW(),
      v_neg.product_id,
      v_adj_loc_id,
      v_freezer_loc_id,
      ABS(v_neg.quantity),
      'manual_adjustment',
      'stock_locations',
      v_freezer_loc_id,
      'Auto-reconciled negative freezer deficit (' || v_neg.quantity || ' pcs -> 0)',
      NULL
    );
    v_healed_deficits := v_healed_deficits + 1;
  END LOOP;

  -- Get updated freezer balances from canonical view
  SELECT jsonb_object_agg(p.id::text, COALESCE(cls.quantity, 0))
  INTO v_balances
  FROM products p
  LEFT JOIN public.current_location_stock cls 
    ON cls.product_id = p.id AND cls.location_id = v_freezer_loc_id;

  RETURN jsonb_build_object(
    'success', true,
    'synced_batch_items', v_synced_batches,
    'synced_issue_items', v_synced_issues,
    'healed_reversals', v_healed_reversals,
    'healed_deficits', v_healed_deficits,
    'freezer_balances', COALESCE(v_balances, '{}'::jsonb),
    'message', 'Freezer stock synchronized and reconciled successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reconcile_freezer_stock_transaction() TO authenticated, anon;
