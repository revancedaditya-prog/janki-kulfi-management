import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '@/lib/mockStore';

describe('Transactional Deletions for Production, Stock Issues, and Settlements', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  describe('Production Batch Deletion', () => {
    it('should delete a draft production batch cleanly', () => {
      const draft = mockStore.createProductionBatch(
        '2026-09-02',
        2500,
        'Test draft',
        [{ product_id: 'prod-sada-10', produced_quantity: 300, damaged_quantity: 10 }],
        'usr-owner-001'
      );

      expect(mockStore.getProductionBatches().find((b) => b.id === draft.id)).toBeDefined();

      const result = mockStore.deleteProductionBatch(draft.id, 'No longer needed', 'usr-owner-001');
      expect(result.success).toBe(true);
      expect(mockStore.getProductionBatches().find((b) => b.id === draft.id)).toBeUndefined();
    });

    it('should reverse stock movements and delete a completed batch', () => {
      const initialStock = mockStore.getAvailableFreezerStock('prod-sada-10');

      const batch = mockStore.createProductionBatch(
        '2026-09-02',
        2000,
        'Batch to complete',
        [{ product_id: 'prod-sada-10', produced_quantity: 200, damaged_quantity: 0 }],
        'usr-owner-001'
      );
      mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

      const stockAfterComplete = mockStore.getAvailableFreezerStock('prod-sada-10');
      expect(stockAfterComplete).toBe(initialStock + 200);

      const res = mockStore.deleteProductionBatch(batch.id, 'Mistake in batch', 'usr-owner-001');
      expect(res.success).toBe(true);

      const stockAfterDelete = mockStore.getAvailableFreezerStock('prod-sada-10');
      expect(stockAfterDelete).toBe(initialStock);
    });

    it('should disallow deletion if business day is closed', () => {
      const batch = mockStore.createProductionBatch(
        '2026-09-02',
        1000,
        'Notes',
        [{ product_id: 'prod-sada-10', produced_quantity: 100, damaged_quantity: 0 }],
        'usr-owner-001'
      );
      mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

      // Close day
      (mockStore as any).state.daily_closings.push({
        id: 'dc-test-01',
        business_date: '2026-09-02',
        status: 'closed',
        closed_at: new Date().toISOString(),
      });

      expect(() => {
        mockStore.deleteProductionBatch(batch.id, 'Trying to delete closed day', 'usr-owner-001');
      }).toThrow(/closed/i);
    });
  });

  describe('Stock Issue Deletion', () => {
    it('should reverse stock back to freezer and delete stock issue', () => {
      // First produce stock into freezer
      const pBatch = mockStore.createProductionBatch(
        '2026-09-02',
        1000,
        'Prod',
        [{ product_id: 'prod-sada-01', produced_quantity: 100, damaged_quantity: 0 }],
        'usr-owner-001'
      );
      mockStore.completeProductionBatch(pBatch.id, 'usr-owner-001');

      const initialFreezerStock = mockStore.getAvailableFreezerStock('prod-sada-01');

      const issue = mockStore.issueSellerStock(
        '2026-09-02',
        'sel-ramesh-01',
        'cart-01',
        [{ product_id: 'prod-sada-01', issued_quantity: 50 }],
        'Issue to delete',
        'usr-owner-001'
      );

      const freezerStockAfterIssue = mockStore.getAvailableFreezerStock('prod-sada-01');
      expect(freezerStockAfterIssue).toBe(initialFreezerStock - 50);

      const res = mockStore.deleteSellerIssue(issue.id, 'Wrong seller issued', 'usr-owner-001');
      expect(res.success).toBe(true);

      const freezerStockAfterDelete = mockStore.getAvailableFreezerStock('prod-sada-01');
      expect(freezerStockAfterDelete).toBe(initialFreezerStock);
      expect(mockStore.getSellerIssues().find((i) => i.id === issue.id)).toBeUndefined();
    });

    it('should disallow deleting stock issue if a settlement is linked', () => {
      const pBatch = mockStore.createProductionBatch(
        '2026-09-02',
        1000,
        'Prod',
        [{ product_id: 'prod-sada-01', produced_quantity: 100, damaged_quantity: 0 }],
        'usr-owner-001'
      );
      mockStore.completeProductionBatch(pBatch.id, 'usr-owner-001');

      const issue = mockStore.issueSellerStock(
        '2026-09-02',
        'sel-ramesh-01',
        'cart-01',
        [{ product_id: 'prod-sada-01', issued_quantity: 50 }],
        'Issue with settlement',
        'usr-owner-001'
      );

      mockStore.processSellerSettlement(
        issue.id,
        '2026-09-02',
        [{ issue_item_id: issue.items[0].id, returned_quantity: 10, damaged_quantity: 0, complimentary_quantity: 0 }],
        400,
        0,
        0,
        'Settled',
        false,
        'usr-owner-001'
      );

      expect(() => {
        mockStore.deleteSellerIssue(issue.id, 'Attempting to delete', 'usr-owner-001');
      }).toThrow(/settlement/i);
    });
  });

  describe('Settlement Deletion', () => {
    it('should reverse stock and reopen issue when approved settlement is deleted', () => {
      const pBatch = mockStore.createProductionBatch(
        '2026-09-02',
        1000,
        'Prod',
        [{ product_id: 'prod-sada-01', produced_quantity: 100, damaged_quantity: 0 }],
        'usr-owner-001'
      );
      mockStore.completeProductionBatch(pBatch.id, 'usr-owner-001');

      const issue = mockStore.issueSellerStock(
        '2026-09-02',
        'sel-ramesh-01',
        'cart-01',
        [{ product_id: 'prod-sada-01', issued_quantity: 50 }],
        'Issue for settlement deletion',
        'usr-owner-001'
      );

      const settlement = mockStore.processSellerSettlement(
        issue.id,
        '2026-09-02',
        [{ issue_item_id: issue.items[0].id, returned_quantity: 15, damaged_quantity: 5, complimentary_quantity: 0, damage_reason: 'Melted' }],
        300,
        0,
        0,
        'Approved by owner',
        true,
        'usr-owner-001'
      );

      expect(settlement.status).toBe('approved');
      expect(mockStore.getSellerIssues().find((i) => i.id === issue.id)?.status).toBe('settled');

      const res = mockStore.deleteSellerSettlement(settlement.id, 'Wrong settlement entered', 'usr-owner-001');
      expect(res.success).toBe(true);

      expect(mockStore.getSettlements().find((s) => s.id === settlement.id)).toBeUndefined();
      // Linked issue should be reopened to 'issued'
      const reopenedIssue = mockStore.getSellerIssues().find((i) => i.id === issue.id);
      expect(reopenedIssue?.status).toBe('issued');
    });
  });

  describe('LPG Cylinder Deletion', () => {
    it('should delete an LPG cylinder and its readings cleanly', () => {
      const cyl = mockStore.addLpgCylinder(
        {
          cylinder_code: 'LPG-DEL-01',
          supplier_id: null,
          supplier_name: 'Test Supplier',
          cylinder_type: 'commercial_19kg',
          rated_gas_capacity: 19.0,
          tare_weight: 15.2,
          full_gross_weight: 34.2,
          current_gross_weight: 34.2,
          status: 'full',
          refill_cost: 1800,
          storage_location: 'Kitchen Area',
          is_active: true,
        },
        'usr-owner-001'
      );

      expect(mockStore.getLpgCylinderById(cyl.id)).toBeDefined();

      // Record a reading
      mockStore.recordLpgReading(cyl.id, 30.0, 'weighed', undefined, 'Test reading', 'usr-owner-001');
      expect(mockStore.getLpgReadings(cyl.id).length).toBeGreaterThan(0);

      // Delete cylinder
      const result = mockStore.deleteLpgCylinder(cyl.id, 'usr-owner-001');
      expect(result.success).toBe(true);

      // Verify cylinder and readings are removed
      expect(mockStore.getLpgCylinderById(cyl.id)).toBeUndefined();
      expect(mockStore.getLpgReadings(cyl.id).length).toBe(0);
    });

    it('should throw error when deleting non-existent cylinder', () => {
      expect(() => {
        mockStore.deleteLpgCylinder('cyl-non-existent-999', 'usr-owner-001');
      }).toThrow(/not found/i);
    });
  });
});

