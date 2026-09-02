-- Migration: 011_cascade_foreign_keys_and_deletions.sql
-- Description: Fix foreign key constraints on seller_settlements and self-referencing revision columns to prevent constraint violation errors on deletions

-- 1. Modify Foreign Key on seller_settlements(seller_issue_id) to ON DELETE CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'seller_settlements_seller_issue_id_fkey'
      AND table_name = 'seller_settlements'
  ) THEN
    ALTER TABLE seller_settlements DROP CONSTRAINT seller_settlements_seller_issue_id_fkey;
  END IF;

  ALTER TABLE seller_settlements
    ADD CONSTRAINT seller_settlements_seller_issue_id_fkey
    FOREIGN KEY (seller_issue_id) REFERENCES seller_issues(id) ON DELETE CASCADE;
END $$;

-- 2. Modify Foreign Key on settlement_items(seller_issue_item_id) to ON DELETE CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'settlement_items_seller_issue_item_id_fkey'
      AND table_name = 'settlement_items'
  ) THEN
    ALTER TABLE settlement_items DROP CONSTRAINT settlement_items_seller_issue_item_id_fkey;
  END IF;

  ALTER TABLE settlement_items
    ADD CONSTRAINT settlement_items_seller_issue_item_id_fkey
    FOREIGN KEY (seller_issue_item_id) REFERENCES seller_issue_items(id) ON DELETE CASCADE;
END $$;

-- 3. Modify Self-Referencing Correction Foreign Keys to ON DELETE SET NULL
DO $$
BEGIN
  -- seller_issues
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_issues_correction_of_id_fkey') THEN
    ALTER TABLE seller_issues DROP CONSTRAINT seller_issues_correction_of_id_fkey;
  END IF;
  ALTER TABLE seller_issues ADD CONSTRAINT seller_issues_correction_of_id_fkey FOREIGN KEY (correction_of_id) REFERENCES seller_issues(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_issues_superseded_by_id_fkey') THEN
    ALTER TABLE seller_issues DROP CONSTRAINT seller_issues_superseded_by_id_fkey;
  END IF;
  ALTER TABLE seller_issues ADD CONSTRAINT seller_issues_superseded_by_id_fkey FOREIGN KEY (superseded_by_id) REFERENCES seller_issues(id) ON DELETE SET NULL;

  -- seller_settlements
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_settlements_correction_of_id_fkey') THEN
    ALTER TABLE seller_settlements DROP CONSTRAINT seller_settlements_correction_of_id_fkey;
  END IF;
  ALTER TABLE seller_settlements ADD CONSTRAINT seller_settlements_correction_of_id_fkey FOREIGN KEY (correction_of_id) REFERENCES seller_settlements(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'seller_settlements_superseded_by_id_fkey') THEN
    ALTER TABLE seller_settlements DROP CONSTRAINT seller_settlements_superseded_by_id_fkey;
  END IF;
  ALTER TABLE seller_settlements ADD CONSTRAINT seller_settlements_superseded_by_id_fkey FOREIGN KEY (superseded_by_id) REFERENCES seller_settlements(id) ON DELETE SET NULL;

  -- production_batches
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'production_batches_correction_of_id_fkey') THEN
    ALTER TABLE production_batches DROP CONSTRAINT production_batches_correction_of_id_fkey;
  END IF;
  ALTER TABLE production_batches ADD CONSTRAINT production_batches_correction_of_id_fkey FOREIGN KEY (correction_of_id) REFERENCES production_batches(id) ON DELETE SET NULL;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'production_batches_superseded_by_id_fkey') THEN
    ALTER TABLE production_batches DROP CONSTRAINT production_batches_superseded_by_id_fkey;
  END IF;
  ALTER TABLE production_batches ADD CONSTRAINT production_batches_superseded_by_id_fkey FOREIGN KEY (superseded_by_id) REFERENCES production_batches(id) ON DELETE SET NULL;
END $$;


-- 4. Update delete_seller_issue_transaction Stored Procedure
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
  -- Lock & load issue
  SELECT * INTO v_issue FROM seller_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock issue not found.';
  END IF;

  -- Check if active settlements exist (approved, pending_approval, or draft)
  SELECT settlement_number INTO v_active_settlement
  FROM seller_settlements
  WHERE (seller_issue_id = p_issue_id OR issue_id = p_issue_id)
    AND status IN ('approved', 'pending_approval', 'draft')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot delete stock issue because an active settlement (%) is linked to it. Please delete the settlement first.', v_active_settlement.settlement_number;
  END IF;

  -- Check closed business day
  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_issue.issue_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_issue.issue_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_issue.seller_id, 'Seller Cart');

  -- If issued, reverse stock back to freezer
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

  -- Audit log before deletion
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_values,
    change_reason,
    user_id,
    created_at
  ) VALUES (
    'seller_issues',
    p_issue_id,
    'DELETE_SELLER_ISSUE',
    jsonb_build_object('issue_number', v_issue.issue_number, 'seller_id', v_issue.seller_id, 'status', v_issue.status),
    p_reason,
    p_user_id,
    NOW()
  );

  -- Clean up any inactive/superseded/cancelled settlement records
  DELETE FROM settlement_items WHERE settlement_id IN (
    SELECT id FROM seller_settlements WHERE seller_issue_id = p_issue_id OR issue_id = p_issue_id
  );
  DELETE FROM seller_settlements WHERE seller_issue_id = p_issue_id OR issue_id = p_issue_id;

  -- Unlink self-referencing correction chains
  UPDATE seller_issues SET correction_of_id = NULL WHERE correction_of_id = p_issue_id;
  UPDATE seller_issues SET superseded_by_id = NULL WHERE superseded_by_id = p_issue_id;

  -- Delete items and issue
  DELETE FROM seller_issue_items WHERE seller_issue_id = p_issue_id;
  DELETE FROM seller_issues WHERE id = p_issue_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stock issue deleted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
