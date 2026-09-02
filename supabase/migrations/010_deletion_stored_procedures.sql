-- Migration 010: Safe Transaction Deletions with Inventory & Settlement Reversals

-- 1. Delete Production Batch Stored Procedure
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
  -- Lock & load batch
  SELECT * INTO v_batch FROM production_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production batch not found.';
  END IF;

  -- Check closed business day
  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_batch.production_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_batch.production_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_prod_loc_id := get_or_create_stock_location('production', NULL, 'Production Floor');

  -- If completed, reverse stock movements
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
    'production_batches',
    p_batch_id,
    'DELETE_PRODUCTION_BATCH',
    jsonb_build_object('batch_number', v_batch.batch_number, 'cost', v_batch.total_ingredient_cost, 'status', v_batch.status),
    p_reason,
    p_user_id,
    NOW()
  );

  -- Delete items and batch
  DELETE FROM production_batch_ingredients WHERE batch_id = p_batch_id;
  DELETE FROM production_items WHERE batch_id = p_batch_id;
  DELETE FROM production_batches WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Production batch deleted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Delete Stock Issue Stored Procedure
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
  v_linked_settlement_count INTEGER;
BEGIN
  -- Lock & load issue
  SELECT * INTO v_issue FROM seller_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock issue not found.';
  END IF;

  -- Check if settlements exist
  SELECT COUNT(*) INTO v_linked_settlement_count
  FROM seller_settlements
  WHERE (seller_issue_id = p_issue_id OR issue_id = p_issue_id)
    AND status NOT IN ('cancelled', 'rejected', 'superseded');

  IF v_linked_settlement_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete stock issue because an active settlement is linked to it. Delete the settlement first.';
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

  -- Delete items and issue
  DELETE FROM seller_issue_items WHERE seller_issue_id = p_issue_id;
  DELETE FROM seller_issues WHERE id = p_issue_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stock issue deleted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Delete Settlement Stored Procedure
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
  -- Lock & load settlement
  SELECT * INTO v_settlement FROM seller_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement not found.';
  END IF;

  -- Check closed business day
  SELECT * INTO v_closing FROM daily_closings WHERE business_date = v_settlement.settlement_date;
  IF FOUND AND v_closing.status = 'closed' THEN
    RAISE EXCEPTION 'Business day (%) is closed. Reopen the business day before deleting this record.', v_settlement.settlement_date;
  END IF;

  v_freezer_loc_id := get_or_create_stock_location('main_freezer', NULL, 'Main Freezer');
  v_seller_loc_id := get_or_create_stock_location('seller', v_settlement.seller_id, 'Seller Cart');
  v_damaged_loc_id := get_or_create_stock_location('damaged', NULL, 'Damaged Stock');
  v_comp_loc_id := get_or_create_stock_location('complimentary', NULL, 'Complimentary Stock');

  -- If approved, reverse stock movements
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

    -- Reopen linked issue
    UPDATE seller_issues
    SET status = 'issued', updated_at = NOW()
    WHERE id = v_settlement.seller_issue_id OR id = v_settlement.issue_id;
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
    'seller_settlements',
    p_settlement_id,
    'DELETE_SELLER_SETTLEMENT',
    jsonb_build_object('settlement_number', v_settlement.settlement_number, 'gross', v_settlement.gross_sales, 'status', v_settlement.status),
    p_reason,
    p_user_id,
    NOW()
  );

  -- Delete items and settlement
  DELETE FROM settlement_items WHERE settlement_id = p_settlement_id;
  DELETE FROM seller_settlements WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Settlement deleted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
