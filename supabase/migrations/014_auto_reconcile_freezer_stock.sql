-- Migration: 014_auto_reconcile_freezer_stock.sql
-- Description: Auto-Reconciliation Engine for Production Batches, Freezer Stock, and Safe UUID Handling

-- 1. Resilient Location Helper
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

-- 2. Stored Procedure: Auto-Reconcile Freezer Stock with All Batches & Issues
CREATE OR REPLACE FUNCTION reconcile_freezer_stock_transaction()
RETURNS JSONB AS $$
DECLARE
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_seller_loc_id UUID;
  v_batch RECORD;
  v_item RECORD;
  v_issue RECORD;
  v_issue_item RECORD;
  v_synced_batches INTEGER := 0;
  v_synced_issues INTEGER := 0;
  v_balances JSONB;
BEGIN
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');
  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');

  -- A. Reconcile Completed Production Batches
  FOR v_batch IN 
    SELECT * FROM production_batches 
    WHERE status = 'completed' AND (is_current_version IS NULL OR is_current_version = true)
  LOOP
    FOR v_item IN 
      SELECT * FROM production_items 
      WHERE batch_id = v_batch.id AND COALESCE(saleable_quantity, 0) > 0
    LOOP
      -- Check if movement already exists
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

  -- B. Reconcile Active Stock Issues
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

  -- Get updated freezer balances
  SELECT jsonb_object_agg(product_id::text, available_quantity)
  INTO v_balances
  FROM v_freezer_stock;

  RETURN jsonb_build_object(
    'success', true,
    'synced_batch_items', v_synced_batches,
    'synced_issue_items', v_synced_issues,
    'freezer_balances', COALESCE(v_balances, '{}'::jsonb),
    'message', 'Freezer stock successfully reconciled and synced with all production batches and issues.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
