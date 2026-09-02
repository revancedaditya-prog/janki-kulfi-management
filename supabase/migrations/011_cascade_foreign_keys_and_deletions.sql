-- Migration: 011_cascade_foreign_keys_and_deletions.sql
-- Description: Self-contained script to add versioning columns, fix foreign key cascading, and install safe delete stored procedures.

-- 1. Ensure Enum Values Exist
DO $$
BEGIN
  ALTER TYPE batch_status ADD VALUE IF NOT EXISTS 'corrected';
  ALTER TYPE batch_status ADD VALUE IF NOT EXISTS 'superseded';

  ALTER TYPE issue_status ADD VALUE IF NOT EXISTS 'corrected';
  ALTER TYPE issue_status ADD VALUE IF NOT EXISTS 'superseded';

  ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'corrected';
  ALTER TYPE settlement_status ADD VALUE IF NOT EXISTS 'superseded';

  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'production_reversal';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'issue_reversal';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'settlement_reversal';
  ALTER TYPE stock_movement_type ADD VALUE IF NOT EXISTS 'correction_replacement';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ensure Versioning & Correction Columns Exist on All Core Tables
ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS correction_of_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by UUID,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

ALTER TABLE seller_issues
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS correction_of_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by UUID,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

ALTER TABLE seller_settlements
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS correction_of_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by UUID,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

-- 3. Configure Foreign Keys with ON DELETE CASCADE and ON DELETE SET NULL
DO $$
BEGIN
  -- 3.1 seller_settlements -> seller_issues (CASCADE)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_settlements_seller_issue_id_fkey' AND table_name = 'seller_settlements') THEN
    ALTER TABLE seller_settlements DROP CONSTRAINT seller_settlements_seller_issue_id_fkey;
  END IF;
  ALTER TABLE seller_settlements
    ADD CONSTRAINT seller_settlements_seller_issue_id_fkey
    FOREIGN KEY (seller_issue_id) REFERENCES seller_issues(id) ON DELETE CASCADE;

  -- 3.2 settlement_items -> seller_issue_items (CASCADE)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'settlement_items_seller_issue_item_id_fkey' AND table_name = 'settlement_items') THEN
    ALTER TABLE settlement_items DROP CONSTRAINT settlement_items_seller_issue_item_id_fkey;
  END IF;
  ALTER TABLE settlement_items
    ADD CONSTRAINT settlement_items_seller_issue_item_id_fkey
    FOREIGN KEY (seller_issue_item_id) REFERENCES seller_issue_items(id) ON DELETE CASCADE;

  -- 3.3 seller_issues Self-Referencing (SET NULL)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_issues_correction_of_id_fkey' AND table_name = 'seller_issues') THEN
    ALTER TABLE seller_issues DROP CONSTRAINT seller_issues_correction_of_id_fkey;
  END IF;
  ALTER TABLE seller_issues
    ADD CONSTRAINT seller_issues_correction_of_id_fkey
    FOREIGN KEY (correction_of_id) REFERENCES seller_issues(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_issues_superseded_by_id_fkey' AND table_name = 'seller_issues') THEN
    ALTER TABLE seller_issues DROP CONSTRAINT seller_issues_superseded_by_id_fkey;
  END IF;
  ALTER TABLE seller_issues
    ADD CONSTRAINT seller_issues_superseded_by_id_fkey
    FOREIGN KEY (superseded_by_id) REFERENCES seller_issues(id) ON DELETE SET NULL;

  -- 3.4 seller_settlements Self-Referencing (SET NULL)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_settlements_correction_of_id_fkey' AND table_name = 'seller_settlements') THEN
    ALTER TABLE seller_settlements DROP CONSTRAINT seller_settlements_correction_of_id_fkey;
  END IF;
  ALTER TABLE seller_settlements
    ADD CONSTRAINT seller_settlements_correction_of_id_fkey
    FOREIGN KEY (correction_of_id) REFERENCES seller_settlements(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_settlements_superseded_by_id_fkey' AND table_name = 'seller_settlements') THEN
    ALTER TABLE seller_settlements DROP CONSTRAINT seller_settlements_superseded_by_id_fkey;
  END IF;
  ALTER TABLE seller_settlements
    ADD CONSTRAINT seller_settlements_superseded_by_id_fkey
    FOREIGN KEY (superseded_by_id) REFERENCES seller_settlements(id) ON DELETE SET NULL;

  -- 3.5 production_batches Self-Referencing (SET NULL)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'production_batches_correction_of_id_fkey' AND table_name = 'production_batches') THEN
    ALTER TABLE production_batches DROP CONSTRAINT production_batches_correction_of_id_fkey;
  END IF;
  ALTER TABLE production_batches
    ADD CONSTRAINT production_batches_correction_of_id_fkey
    FOREIGN KEY (correction_of_id) REFERENCES production_batches(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'production_batches_superseded_by_id_fkey' AND table_name = 'production_batches') THEN
    ALTER TABLE production_batches DROP CONSTRAINT production_batches_superseded_by_id_fkey;
  END IF;
  ALTER TABLE production_batches
    ADD CONSTRAINT production_batches_superseded_by_id_fkey
    FOREIGN KEY (superseded_by_id) REFERENCES production_batches(id) ON DELETE SET NULL;
END $$;

-- 4. Delete Production Batch Stored Procedure
CREATE OR REPLACE FUNCTION delete_production_batch_transaction(
  p_batch_id UUID,
  p_reason TEXT DEFAULT 'Deleted by Owner',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_prod_loc_id UUID;
  v_freezer_loc_id UUID;
  v_closing RECORD;
BEGIN
  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found.';
  END IF;

  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_batch.production_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_batch.production_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');

  IF v_batch.status = 'completed' THEN
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
          v_freezer_loc_id,
          v_prod_loc_id,
          v_item.saleable_quantity,
          'production_reversal',
          'production_batches',
          p_batch_id,
          'Reversal for deleted production batch ' || v_batch.batch_number || ': ' || COALESCE(p_reason, 'Deleted'),
          p_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- Unlink self-referencing pointers
  UPDATE production_batches SET correction_of_id = NULL WHERE correction_of_id = p_batch_id;
  UPDATE production_batches SET superseded_by_id = NULL WHERE superseded_by_id = p_batch_id;

  DELETE FROM production_batch_ingredients WHERE batch_id = p_batch_id;
  DELETE FROM production_items WHERE batch_id = p_batch_id;
  DELETE FROM production_batches WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'message', 'Production batch deleted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Delete Stock Issue Stored Procedure
CREATE OR REPLACE FUNCTION delete_seller_issue_transaction(
  p_issue_id UUID,
  p_reason TEXT DEFAULT 'Deleted by Owner',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_issue RECORD;
  v_item RECORD;
  v_seller_loc_id UUID;
  v_freezer_loc_id UUID;
  v_closing RECORD;
  v_active_settlement RECORD;
BEGIN
  SELECT * INTO v_issue FROM seller_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock issue not found.';
  END IF;

  SELECT settlement_number INTO v_active_settlement
  FROM seller_settlements
  WHERE (seller_issue_id = p_issue_id OR issue_id = p_issue_id)
    AND status IN ('approved', 'pending_approval', 'draft')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot delete stock issue because an active settlement (%) is linked to it. Please delete the settlement first.', v_active_settlement.settlement_number;
  END IF;

  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_issue.issue_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_issue.issue_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_issue.seller_id, 'Seller Cart');

  IF v_issue.status = 'issued' THEN
    FOR v_item IN SELECT * FROM seller_issue_items WHERE seller_issue_id = p_issue_id LOOP
      IF COALESCE(v_item.issued_quantity, 0) > 0 THEN
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
          v_seller_loc_id,
          v_freezer_loc_id,
          v_item.issued_quantity,
          'issue_reversal',
          'seller_issues',
          p_issue_id,
          'Reversal for deleted stock issue ' || v_issue.issue_number || ': ' || COALESCE(p_reason, 'Deleted'),
          p_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- Clean up any inactive/superseded/cancelled settlement records
  DELETE FROM settlement_items WHERE settlement_id IN (
    SELECT id FROM seller_settlements WHERE seller_issue_id = p_issue_id OR issue_id = p_issue_id
  );
  DELETE FROM seller_settlements WHERE seller_issue_id = p_issue_id OR issue_id = p_issue_id;

  -- Unlink self-referencing correction chains
  UPDATE seller_issues SET correction_of_id = NULL WHERE correction_of_id = p_issue_id;
  UPDATE seller_issues SET superseded_by_id = NULL WHERE superseded_by_id = p_issue_id;

  DELETE FROM seller_issue_items WHERE seller_issue_id = p_issue_id;
  DELETE FROM seller_issues WHERE id = p_issue_id;

  RETURN jsonb_build_object('success', true, 'message', 'Stock issue deleted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Delete Settlement Stored Procedure
CREATE OR REPLACE FUNCTION delete_seller_settlement_transaction(
  p_settlement_id UUID,
  p_reason TEXT DEFAULT 'Deleted by Owner',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_settlement RECORD;
  v_item RECORD;
  v_seller_loc_id UUID;
  v_freezer_loc_id UUID;
  v_damaged_loc_id UUID;
  v_comp_loc_id UUID;
  v_closing RECORD;
BEGIN
  SELECT * INTO v_settlement FROM seller_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found.';
  END IF;

  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_settlement.settlement_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_settlement.settlement_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_settlement.seller_id, 'Seller Cart');
  v_damaged_loc_id := get_or_create_stock_location('damaged', NULL, 'Damaged Stock');
  v_comp_loc_id := get_or_create_stock_location('complimentary', NULL, 'Complimentary Stock');

  IF v_settlement.status = 'approved' THEN
    FOR v_item IN SELECT * FROM settlement_items WHERE settlement_id = p_settlement_id LOOP
      IF COALESCE(v_item.returned_quantity, 0) > 0 THEN
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
          v_freezer_loc_id,
          v_seller_loc_id,
          v_item.returned_quantity,
          'settlement_reversal',
          'seller_settlements',
          p_settlement_id,
          'Returned stock reversed for deleted settlement ' || v_settlement.settlement_number,
          p_user_id
        );
      END IF;

      IF COALESCE(v_item.damaged_quantity, 0) > 0 THEN
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
          v_damaged_loc_id,
          v_seller_loc_id,
          v_item.damaged_quantity,
          'settlement_reversal',
          'seller_settlements',
          p_settlement_id,
          'Damaged stock reversed for deleted settlement ' || v_settlement.settlement_number,
          p_user_id
        );
      END IF;

      IF COALESCE(v_item.complimentary_quantity, 0) > 0 THEN
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
          v_comp_loc_id,
          v_seller_loc_id,
          v_item.complimentary_quantity,
          'settlement_reversal',
          'seller_settlements',
          p_settlement_id,
          'Complimentary stock reversed for deleted settlement ' || v_settlement.settlement_number,
          p_user_id
        );
      END IF;
    END LOOP;

    UPDATE seller_issues
    SET status = 'issued', updated_at = NOW()
    WHERE id = v_settlement.seller_issue_id OR id = v_settlement.issue_id;
  END IF;

  -- Unlink self-referencing correction chains
  UPDATE seller_settlements SET correction_of_id = NULL WHERE correction_of_id = p_settlement_id;
  UPDATE seller_settlements SET superseded_by_id = NULL WHERE superseded_by_id = p_settlement_id;

  DELETE FROM settlement_items WHERE settlement_id = p_settlement_id;
  DELETE FROM seller_settlements WHERE id = p_settlement_id;

  RETURN jsonb_build_object('success', true, 'message', 'Settlement deleted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Adjust Freezer Stock Stored Procedure
CREATE OR REPLACE FUNCTION adjust_freezer_stock_transaction(
  p_product_id UUID,
  p_new_quantity INTEGER,
  p_reason TEXT DEFAULT 'Manual Adjustment',
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_freezer_loc_id UUID;
  v_adj_loc_id UUID;
  v_current_qty INTEGER;
  v_target_qty INTEGER;
  v_diff INTEGER;
  v_product RECORD;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_adj_loc_id := get_or_create_stock_location('damaged', NULL, 'Inventory Adjustment');

  v_current_qty := get_available_freezer_stock(p_product_id);
  v_target_qty := GREATEST(0, p_new_quantity);
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

  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    change_reason,
    user_id,
    created_at
  ) VALUES (
    'stock_locations',
    v_freezer_loc_id,
    'FREEZER_STOCK_ADJUSTMENT',
    jsonb_build_object('product_id', p_product_id, 'previous_quantity', v_current_qty),
    jsonb_build_object('product_id', p_product_id, 'new_quantity', v_target_qty, 'difference', v_diff),
    p_reason,
    p_user_id,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'previous_quantity', v_current_qty,
    'new_quantity', v_target_qty,
    'difference', v_diff,
    'message', 'Freezer stock adjusted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

