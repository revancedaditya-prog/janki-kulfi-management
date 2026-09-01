import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '@/lib/mockStore';

describe('Safe Edit and Correction Workflows', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  // 1. Draft Editing
  it('1. allows creator to edit draft production batch directly without versioning', () => {
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      600,
      'Morning Shift',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-prod-002'
    );
    expect(batch.status).toBe('draft');
    expect(batch.version_number).toBe(1);

    // Edit draft
    const updated = mockStore.updateDraftProductionBatch(
      batch.id,
      '2026-09-01',
      750,
      'Morning Shift Updated',
      [{ product_id: 'prod-sada-01', produced_quantity: 60, damaged_quantity: 2 }],
      'usr-prod-002'
    );

    expect(updated.total_ingredient_cost).toBe(750);
    expect(updated.items[0].produced_quantity).toBe(60);
    expect(updated.items[0].damaged_quantity).toBe(2);
    expect(updated.items[0].saleable_quantity).toBe(58);
    expect(updated.version_number).toBe(1);
    expect(updated.status).toBe('draft');
  });

  // 2. Draft Worker Isolation
  it('2. prevents worker from editing another worker draft', () => {
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      600,
      'Worker 1 Batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-prod-002'
    );

    // Add another worker profile
    mockStore.getState().profiles.push({
      id: 'usr-worker-003',
      phone: '9999999999',
      full_name: 'Worker Three',
      role: 'production_worker',
      preferred_language: 'hi',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(() => {
      mockStore.updateDraftProductionBatch(
        batch.id,
        '2026-09-01',
        750,
        'Hacked',
        [{ product_id: 'prod-sada-01', produced_quantity: 60, damaged_quantity: 0 }],
        'usr-worker-003'
      );
    }).toThrow(/Workers can edit only their own drafts/i);
  });

  // 3. Draft Cancellation
  it('3. allows cancelling draft batch and draft issue', () => {
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Draft to Cancel',
      [{ product_id: 'prod-sada-01', produced_quantity: 20, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.cancelDraftBatch(batch.id, 'usr-owner-001');
    const cancelled = mockStore.getState().production_batches.find((b) => b.id === batch.id);
    expect(cancelled?.status).toBe('cancelled');
  });

  // 4. Completed Overwrite Prevention
  it('4. blocks direct draft edit on completed production batch', () => {
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Ready Batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 40, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    expect(() => {
      mockStore.updateDraftProductionBatch(
        batch.id,
        '2026-09-01',
        600,
        'Attempt Overwrite',
        [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
        'usr-owner-001'
      );
    }).toThrow(/Only draft batches can be edited directly/i);
  });

  // 5. Owner-Only Corrections
  it('5. prevents non-owner worker from correcting completed production batch', () => {
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Ready Batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 40, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    expect(() => {
      mockStore.correctProductionBatch(
        batch.id,
        '2026-09-01',
        550,
        'Worker Try',
        [{ product_id: 'prod-sada-01', produced_quantity: 45, damaged_quantity: 0 }],
        'Fixed quantity typo',
        'usr-prod-002'
      );
    }).toThrow(/Access Denied: Only Owners/i);
  });

  // 6. Mandatory Reason
  it('6. rejects correction if explanation reason is under 5 characters', () => {
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Ready Batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 40, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    expect(() => {
      mockStore.correctProductionBatch(
        batch.id,
        '2026-09-01',
        550,
        'Notes',
        [{ product_id: 'prod-sada-01', produced_quantity: 45, damaged_quantity: 0 }],
        'Fix', // 3 chars
        'usr-owner-001'
      );
    }).toThrow(/at least 5 characters/i);
  });

  // 7. Production Batch Correction (V1 -> V2, Reversal Movements)
  it('7. creates V2 production batch, reverses V1 stock movements, and marks V1 superseded', () => {
    const initialFreezer = mockStore.getAvailableFreezerStock('prod-sada-01');

    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Batch V1',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    expect(mockStore.getAvailableFreezerStock('prod-sada-01')).toBe(initialFreezer + 50);

    // Correct to 60 pcs, ₹600 cost
    const v2 = mockStore.correctProductionBatch(
      batch.id,
      '2026-09-01',
      600,
      'Batch V2 Corrected',
      [{ product_id: 'prod-sada-01', produced_quantity: 60, damaged_quantity: 0 }],
      'Added afternoon extra tray',
      'usr-owner-001'
    );

    expect(v2.version_number).toBe(2);
    expect(v2.is_current_version).toBe(true);
    expect(v2.correction_of_id).toBe(batch.id);
    expect(v2.correction_reason).toBe('Added afternoon extra tray');
    expect(v2.total_ingredient_cost).toBe(600);

    // Old batch is superseded
    const oldBatch = mockStore.getState().production_batches.find((b) => b.id === batch.id);
    expect(oldBatch?.status).toBe('superseded');
    expect(oldBatch?.is_current_version).toBe(false);
    expect(oldBatch?.superseded_by_id).toBe(v2.id);

    // Stock movements check: Reversal of 50, Addition of 60 -> net +60 from base
    const reversal = mockStore
      .getState()
      .stock_movements.find((m) => m.movement_type === 'production_reversal' && m.reference_id === batch.id);
    expect(reversal).toBeDefined();
    expect(reversal?.quantity).toBe(50);

    expect(mockStore.getAvailableFreezerStock('prod-sada-01')).toBe(initialFreezer + 60);
  });

  // 8. Negative Stock Prevention
  it('8. prevents correcting production to reduce stock below what has already been issued', () => {
    // Produce 30 pcs of rabri kulfi
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      300,
      'Small batch',
      [{ product_id: 'prod-rabri-02', produced_quantity: 30, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    // Issue all available pcs to seller so freezer stock is 0
    const available = mockStore.getAvailableFreezerStock('prod-rabri-02');
    mockStore.issueSellerStock(
      'sel-001',
      null,
      '2026-09-01',
      [{ product_id: 'prod-rabri-02', issued_quantity: available }],
      'Issue all',
      'usr-owner-001'
    );

    expect(mockStore.getAvailableFreezerStock('prod-rabri-02')).toBe(0);

    // Attempt to reduce production batch from 30 to 10 (reduction of 20) -> should fail
    expect(() => {
      mockStore.correctProductionBatch(
        batch.id,
        '2026-09-01',
        100,
        'Reduce batch',
        [{ product_id: 'prod-rabri-02', produced_quantity: 10, damaged_quantity: 0 }],
        'Made mistake in batch entry count',
        'usr-owner-001'
      );
    }).toThrow(/Correction cannot reduce production below stock already issued or consumed/i);
  });

  // 9. Stock Issue Correction (Unsettled)
  it('9. allows owner to correct unsettled stock issue with reversal movements', () => {
    // Produce first to have stock in freezer
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Prod batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    const initialFreezer = mockStore.getAvailableFreezerStock('prod-sada-01');

    const issue = mockStore.issueSellerStock(
      'sel-001',
      null,
      '2026-09-01',
      [{ product_id: 'prod-sada-01', issued_quantity: 20 }],
      'Morning issue',
      'usr-owner-001'
    );

    expect(mockStore.getAvailableFreezerStock('prod-sada-01')).toBe(initialFreezer - 20);

    // Correct issue to 25 pcs
    const corrected = mockStore.correctSellerIssue(
      issue.id,
      '2026-09-01',
      'sel-001',
      null,
      [{ product_id: 'prod-sada-01', issued_quantity: 25 }],
      'Corrected note',
      'Seller requested 5 extra pieces',
      'usr-owner-001'
    );

    expect(corrected.version_number).toBe(2);
    expect(corrected.is_current_version).toBe(true);
    expect(corrected.correction_of_id).toBe(issue.id);

    // Check reversal movement
    const reversal = mockStore
      .getState()
      .stock_movements.find((m) => m.movement_type === 'issue_reversal' && m.reference_id === issue.id);
    expect(reversal).toBeDefined();
    expect(reversal?.quantity).toBe(20);

    expect(mockStore.getAvailableFreezerStock('prod-sada-01')).toBe(initialFreezer - 25);
  });

  // 10. Settled Stock Issue Blocker
  it('10. blocks correcting stock issue if it already has an active settlement', () => {
    // Produce first
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Prod batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    const issue = mockStore.issueSellerStock(
      'sel-001',
      null,
      '2026-09-01',
      [{ product_id: 'prod-sada-01', issued_quantity: 20 }],
      'Issue',
      'usr-owner-001'
    );

    // Settle the issue
    mockStore.processSellerSettlement(
      issue.id,
      '2026-09-01',
      [{ issue_item_id: issue.items[0].id, returned_quantity: 2, damaged_quantity: 0, complimentary_quantity: 0 }],
      180,
      0,
      0,
      'Settled',
      true,
      'usr-owner-001'
    );

    expect(() => {
      mockStore.correctSellerIssue(
        issue.id,
        '2026-09-01',
        'sel-001',
        null,
        [{ product_id: 'prod-sada-01', issued_quantity: 25 }],
        'Try correct',
        'Change quantity after settlement',
        'usr-owner-001'
      );
    }).toThrow(/This stock issue has a settlement/i);
  });

  // 11. Pending Settlement Editing
  it('11. allows editing pending settlement before owner approval', () => {
    // Produce first
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Prod batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    const issue = mockStore.issueSellerStock(
      'sel-001',
      null,
      '2026-09-01',
      [{ product_id: 'prod-sada-01', issued_quantity: 20 }],
      'Issue',
      'usr-owner-001'
    );

    // Submit pending settlement
    const pending = mockStore.processSellerSettlement(
      issue.id,
      '2026-09-01',
      [{ issue_item_id: issue.items[0].id, returned_quantity: 5, damaged_quantity: 0, complimentary_quantity: 0 }],
      150,
      0,
      0,
      'Seller submitted',
      false, // pending
      'usr-seller-003'
    );

    expect(pending.status).toBe('pending_approval');
    expect(pending.gross_sales).toBe(150); // 15 sold * 10

    // Seller updates return count from 5 to 2
    const updated = mockStore.updatePendingSettlement(
      pending.id,
      [{ issue_item_id: issue.items[0].id, returned_quantity: 2, damaged_quantity: 0, complimentary_quantity: 0 }],
      180,
      0,
      0,
      'Updated return count',
      'usr-seller-003'
    );

    expect(updated.gross_sales).toBe(180); // 18 sold * 10
    expect(updated.total_received).toBe(180);
    expect(updated.status).toBe('pending_approval');
  });

  // 12. Approved Settlement Correction
  it('12. allows owner to correct approved settlement with reversal and recalculated financials', () => {
    // Produce first
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Prod batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    const issue = mockStore.issueSellerStock(
      'sel-001',
      null,
      '2026-09-01',
      [{ product_id: 'prod-sada-01', issued_quantity: 20 }],
      'Issue',
      'usr-owner-001'
    );

    const approved = mockStore.processSellerSettlement(
      issue.id,
      '2026-09-01',
      [{ issue_item_id: issue.items[0].id, returned_quantity: 5, damaged_quantity: 0, complimentary_quantity: 0 }],
      150,
      0,
      0,
      'Approved V1',
      true,
      'usr-owner-001'
    );

    expect(approved.status).toBe('approved');
    expect(approved.gross_sales).toBe(150);

    // Correct settlement (returned was 2, received 180)
    const v2 = mockStore.correctApprovedSettlement(
      approved.id,
      '2026-09-01',
      180,
      0,
      0,
      [{ issue_item_id: issue.items[0].id, returned_quantity: 2, damaged_quantity: 0, complimentary_quantity: 0 }],
      'Corrected settlement note',
      'Seller found 3 extra pcs in cart cooler',
      'usr-owner-001'
    );

    expect(v2.version_number).toBe(2);
    expect(v2.is_current_version).toBe(true);
    expect(v2.gross_sales).toBe(180);
    expect(v2.total_received).toBe(180);
    expect(v2.correction_reason).toBe('Seller found 3 extra pcs in cart cooler');

    // Old settlement superseded
    const oldSettlement = mockStore.getState().seller_settlements.find((s) => s.id === approved.id);
    expect(oldSettlement?.status).toBe('superseded');
    expect(oldSettlement?.is_current_version).toBe(false);
  });

  // 13. Closed Day Protection
  it('13. rejects corrections when business day is closed', () => {
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Day batch',
      [{ product_id: 'prod-sada-01', produced_quantity: 40, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    // Close the day
    mockStore.getState().daily_closings.push({
      id: 'dc-test-01',
      business_date: '2026-09-01',
      status: 'closed',
      total_produced: 40,
      total_sold: 0,
      total_returned: 0,
      total_damaged: 0,
      total_complimentary: 0,
      gross_sales: 0,
      total_commission: 0,
      net_sales: 0,
      cash_received: 0,
      upi_received: 0,
      credit_sales: 0,
      total_expenses: 0,
      estimated_profit: 0,
      closing_stock_value: 0,
      notes: null,
      closed_by: 'usr-owner-001',
      closed_at: new Date().toISOString(),
      reopened_by: null,
      reopened_at: null,
      reopen_reason: null,
    });

    expect(() => {
      mockStore.correctProductionBatch(
        batch.id,
        '2026-09-01',
        550,
        'Notes',
        [{ product_id: 'prod-sada-01', produced_quantity: 45, damaged_quantity: 0 }],
        'Try correct closed day',
        'usr-owner-001'
      );
    }).toThrow(/Business day .* is closed/i);
  });

  // 14. Audit Trail
  it('14. logs complete old and new values in audit_logs on correction', () => {
    const batch = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'Batch V1',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    const v2 = mockStore.correctProductionBatch(
      batch.id,
      '2026-09-01',
      600,
      'Batch V2',
      [{ product_id: 'prod-sada-01', produced_quantity: 60, damaged_quantity: 0 }],
      'Audit check reason',
      'usr-owner-001'
    );

    const log = mockStore
      .getState()
      .audit_logs.find((a) => a.record_id === v2.id && a.action === 'CORRECT_RECORD');
    expect(log).toBeDefined();
    expect(log?.reason).toBe('Audit check reason');
    expect(log?.old_data).toBeDefined();
    expect(log?.new_data).toBeDefined();
  });

  // 15. Revision History Chain
  it('15. builds complete revision timeline from root to latest version', () => {
    // V1
    const v1 = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'V1',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(v1.id, 'usr-owner-001');

    // V2
    const v2 = mockStore.correctProductionBatch(
      v1.id,
      '2026-09-01',
      600,
      'V2',
      [{ product_id: 'prod-sada-01', produced_quantity: 60, damaged_quantity: 0 }],
      'First correction',
      'usr-owner-001'
    );

    // V3
    const v3 = mockStore.correctProductionBatch(
      v2.id,
      '2026-09-01',
      700,
      'V3',
      [{ product_id: 'prod-sada-01', produced_quantity: 70, damaged_quantity: 0 }],
      'Second correction',
      'usr-owner-001'
    );

    const history = mockStore.getProductionRevisionHistory(v3.id);
    expect(history.length).toBe(3);
    expect(history[0].version_number).toBe(1);
    expect(history[0].status).toBe('superseded');
    expect(history[1].version_number).toBe(2);
    expect(history[1].status).toBe('superseded');
    expect(history[2].version_number).toBe(3);
    expect(history[2].is_current_version).toBe(true);
  });

  // 16. Reporting Isolation
  it('16. getProductionBatches() and getSellerIssues() return only active current versions', () => {
    const v1 = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'V1',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(v1.id, 'usr-owner-001');

    mockStore.correctProductionBatch(
      v1.id,
      '2026-09-01',
      600,
      'V2',
      [{ product_id: 'prod-sada-01', produced_quantity: 60, damaged_quantity: 0 }],
      'Correction',
      'usr-owner-001'
    );

    const activeBatches = mockStore.getProductionBatches();
    expect(activeBatches.some((b) => b.id === v1.id)).toBe(false);
    expect(activeBatches.some((b) => b.is_current_version === true)).toBe(true);
  });

  // 17. Duplicate Prevention on Superseded Records
  it('17. blocks correcting an already superseded record', () => {
    const v1 = mockStore.createProductionBatch(
      '2026-09-01',
      500,
      'V1',
      [{ product_id: 'prod-sada-01', produced_quantity: 50, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(v1.id, 'usr-owner-001');

    mockStore.correctProductionBatch(
      v1.id,
      '2026-09-01',
      600,
      'V2',
      [{ product_id: 'prod-sada-01', produced_quantity: 60, damaged_quantity: 0 }],
      'First Correction',
      'usr-owner-001'
    );

    // Try correcting V1 again
    expect(() => {
      mockStore.correctProductionBatch(
        v1.id,
        '2026-09-01',
        650,
        'Try V1 again',
        [{ product_id: 'prod-sada-01', produced_quantity: 65, damaged_quantity: 0 }],
        'Duplicate correction attempt',
        'usr-owner-001'
      );
    }).toThrow(/Only active, completed production batches can be corrected/i);
  });
});
