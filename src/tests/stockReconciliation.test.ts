import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '@/lib/mockStore';

describe('Authoritative Stock Reconciliation and Batch Sync Flow', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('1. Resetting 654/294/156 to zero creates exact reversing adjustments', () => {
    const products = mockStore.getProducts();
    const sada = products.find((p) => p.sku === 'JK-SADA-01')!;
    const rabri = products.find((p) => p.sku === 'JK-RABRI-02')!;
    const prem = products.find((p) => p.sku === 'JK-PREM-03')!;

    // Set initial mock state balances to 654, 294, 156
    mockStore.adjustFreezerStock(sada.id, 654, 'Initial seed');
    mockStore.adjustFreezerStock(rabri.id, 294, 'Initial seed');
    mockStore.adjustFreezerStock(prem.id, 156, 'Initial seed');

    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(654);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(294);
    expect(mockStore.getAvailableFreezerStock(prem.id)).toBe(156);

    const movementsBeforeCount = mockStore.getStockMovements().length;

    // Perform reconciliation to 0
    const res = mockStore.reconcileFreezerStockCounts(
      {
        [sada.id]: 0,
        [rabri.id]: 0,
        [prem.id]: 0,
      },
      'Physical count reset to 0 by Owner'
    );

    expect(res.success).toBe(true);
    expect(res.total_adjusted_products).toBe(3);

    // Verify adjustments array
    const sadaAdj = res.adjustments.find((a) => a.product_id === sada.id);
    const rabriAdj = res.adjustments.find((a) => a.product_id === rabri.id);
    const premAdj = res.adjustments.find((a) => a.product_id === prem.id);

    expect(sadaAdj?.difference).toBe(-654);
    expect(rabriAdj?.difference).toBe(-294);
    expect(premAdj?.difference).toBe(-156);

    // Verify new stock movements created are strictly positive in quantity
    const newMovements = mockStore.getStockMovements().slice(movementsBeforeCount);
    expect(newMovements.length).toBe(3);
    for (const m of newMovements) {
      expect(m.quantity).toBeGreaterThan(0);
      expect(m.movement_type).toBe('inventory_adjustment');
    }

    // Verify available stock is now 0 for all
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(0);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(0);
    expect(mockStore.getAvailableFreezerStock(prem.id)).toBe(0);
  });

  it('2. Repeating the same reconciliation operation does not duplicate adjustments', () => {
    const products = mockStore.getProducts();
    const sada = products.find((p) => p.sku === 'JK-SADA-01')!;
    mockStore.adjustFreezerStock(sada.id, 100, 'Seed 100');

    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(100);

    // First reconciliation to 50
    const res1 = mockStore.reconcileFreezerStockCounts({ [sada.id]: 50 }, 'Count 50');
    expect(res1.total_adjusted_products).toBe(1);
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(50);

    const movCountAfterFirst = mockStore.getStockMovements().length;

    // Repeating reconciliation with target 50
    const res2 = mockStore.reconcileFreezerStockCounts({ [sada.id]: 50 }, 'Count 50 again');
    expect(res2.total_adjusted_products).toBe(0);
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(50);

    // No extra stock movement created
    expect(mockStore.getStockMovements().length).toBe(movCountAfterFirst);
  });

  it('3. Reconcile rejects empty reason', () => {
    const products = mockStore.getProducts();
    expect(() => {
      mockStore.reconcileFreezerStockCounts({ [products[0].id]: 10 }, '   ');
    }).toThrow('Reconciliation reason is mandatory');
  });

  it('4. Sync with nothing missing reports no changes', () => {
    const syncRes = mockStore.syncCompletedBatchesStock();
    expect(syncRes.success).toBe(true);
    expect(syncRes.synced_count).toBe(0);
    expect(syncRes.message).toBe('Stock already synchronized—no changes required.');
  });

  it('5. Sync creates movements only for completed, non-deleted production batches', () => {
    const products = mockStore.getProducts();
    const sada = products.find((p) => p.sku === 'JK-SADA-01')!;

    // Create a completed batch without movement
    const batch = mockStore.createProductionBatch(
      '2026-09-04',
      500,
      'Sync test batch',
      [
        {
          product_id: sada.id,
          produced_quantity: 100,
          damaged_quantity: 0,
        },
      ],
      'usr-owner-001'
    );

    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    // Remove the movement manually to simulate missing sync
    (mockStore as any).state.stock_movements = mockStore
      .getStockMovements()
      .filter((m) => !(m.reference_table === 'production_batches' && m.reference_id === batch.id));

    // Run sync
    const syncRes = mockStore.syncCompletedBatchesStock();
    expect(syncRes.success).toBe(true);
    expect(syncRes.synced_count).toBe(1);

    // Running sync again should be idempotent
    const syncRes2 = mockStore.syncCompletedBatchesStock();
    expect(syncRes2.synced_count).toBe(0);
  });
});
