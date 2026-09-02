import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '../lib/mockStore';
import { api } from '../lib/api';

describe('Authoritative Freezer Balance & Reversal Isolation Suite', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('1. Exact User Case: BAT-20260902-7914 with prior historical batch deletions', async () => {
    const products = mockStore.getProducts();
    const sada = products.find((p) => p.sku === 'JK-SADA-01') || products[0];
    const rabri = products.find((p) => p.sku === 'JK-RABRI-02') || products[1];
    const premium = products.find((p) => p.sku === 'JK-PREM-03') || products[2];

    // Step A: Simulate an OLD historical production batch (Old Batch: Sada 978, Rabri 289, Premium 116)
    const oldBatch = await api.createProductionBatch(
      '2026-09-01',
      1200,
      'Old deleted batch',
      [
        { product_id: sada.id, produced_quantity: 978, damaged_quantity: 0 },
        { product_id: rabri.id, produced_quantity: 289, damaged_quantity: 0 },
        { product_id: premium.id, produced_quantity: 116, damaged_quantity: 0 },
      ],
      'usr-owner-001'
    );

    expect(oldBatch.status).toBe('completed');
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(978);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(289);
    expect(mockStore.getAvailableFreezerStock(premium.id)).toBe(116);

    // Step B: Delete Old Batch -> Creates production_reversal entries referencing oldBatch.id
    const delRes = await api.deleteProductionBatch(oldBatch.id, 'Accidental duplicate entry', 'usr-owner-001');
    expect(delRes.success).toBe(true);

    // Net contribution of Old Batch is now exactly 0
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(0);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(0);
    expect(mockStore.getAvailableFreezerStock(premium.id)).toBe(0);

    // Verify reversal movements exist in ledger and reference old batch ID
    const movementsAfterDelete = mockStore.getStockMovements();
    const reversals = movementsAfterDelete.filter((m) => m.movement_type === 'production_reversal');
    expect(reversals.length).toBe(3);
    expect(reversals.every((m) => m.reference_id === oldBatch.id)).toBe(true);

    // Step C: Create NEW Production Batch BAT-20260902-7914 (Sada 978, Rabri 289, Premium 116)
    const newBatch = await api.createProductionBatch(
      '2026-09-02',
      1500,
      'BAT-20260902-7914 Daily Production',
      [
        { product_id: sada.id, produced_quantity: 978, damaged_quantity: 0 },
        { product_id: rabri.id, produced_quantity: 289, damaged_quantity: 0 },
        { product_id: premium.id, produced_quantity: 116, damaged_quantity: 0 },
      ],
      'usr-owner-001'
    );

    expect(newBatch.status).toBe('completed');

    // Step D: Verify Available Freezer Stock via single authoritative balance service
    const balances = await api.getFreezerBalances();
    expect(balances[sada.id]).toBe(978);
    expect(balances[rabri.id]).toBe(289);
    expect(balances[premium.id]).toBe(116);

    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(978);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(289);
    expect(mockStore.getAvailableFreezerStock(premium.id)).toBe(116);

    // Verify getProducts() gives the exact same available_quantity
    const productsWithStock = await api.getProducts();
    const sadaWithStock = productsWithStock.find((p) => p.id === sada.id);
    const rabriWithStock = productsWithStock.find((p) => p.id === rabri.id);
    const premWithStock = productsWithStock.find((p) => p.id === premium.id);

    expect(sadaWithStock?.available_quantity).toBe(978);
    expect(rabriWithStock?.available_quantity).toBe(289);
    expect(premWithStock?.available_quantity).toBe(116);

    // Step E: Verify Total Stock Pieces and Total Stock Value
    const totalPieces = productsWithStock.reduce((sum, p) => sum + (p.available_quantity || 0), 0);
    const totalValue = productsWithStock.reduce(
      (sum, p) => sum + (p.available_quantity || 0) * (p.current_price || 0),
      0
    );

    expect(totalPieces).toBe(1383); // 978 + 289 + 116
    expect(totalValue).toBe(20200);  // (978 * 10) + (289 * 20) + (116 * 40) = 9780 + 5780 + 4640 = 20200

    // Step F: Issue Stock to Ramesh Cart (Sada 100, Rabri 50, Premium 10)
    const issue = await api.issueSellerStock(
      'slr-001',
      'cart-01',
      '2026-09-02',
      [
        { product_id: sada.id, issued_quantity: 100 },
        { product_id: rabri.id, issued_quantity: 50 },
        { product_id: premium.id, issued_quantity: 10 },
      ],
      'Morning dispatch',
      'usr-owner-001'
    );
    expect(issue).toBeDefined();

    // Step G: Verify remaining freezer stock immediately updates
    const remainingBalances = await api.getFreezerBalances();
    expect(remainingBalances[sada.id]).toBe(878);
    expect(remainingBalances[rabri.id]).toBe(239);
    expect(remainingBalances[premium.id]).toBe(106);

    const remainingProducts = await api.getProducts();
    const remainingPieces = remainingProducts.reduce((sum, p) => sum + (p.available_quantity || 0), 0);
    expect(remainingPieces).toBe(1223); // 878 + 239 + 106 = 1223
  });

  it('2. Mandatory Test: Batch A / Batch B Reversal Isolation', async () => {
    const products = mockStore.getProducts();
    const sada = products.find((p) => p.sku === 'JK-SADA-01') || products[0];

    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(0);

    // 1. Create Batch A -> Sada +100
    const batchA = await api.createProductionBatch(
      '2026-09-02',
      200,
      'Batch A',
      [{ product_id: sada.id, produced_quantity: 100, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(100);

    // 2. Delete Batch A -> Batch A reversal -> Sada -100
    const delA = await api.deleteProductionBatch(batchA.id, 'Deleting Batch A', 'usr-owner-001');
    expect(delA.success).toBe(true);
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(0);

    // 3. Create Batch B -> Sada +100
    const batchB = await api.createProductionBatch(
      '2026-09-02',
      200,
      'Batch B',
      [{ product_id: sada.id, produced_quantity: 100, damaged_quantity: 0 }],
      'usr-owner-001'
    );

    // Expected current stock: 100 (Batch A reversal must NEVER cancel Batch B)
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(100);
    const balanceB = await api.getAvailableFreezerStock(sada.id);
    expect(balanceB).toBe(100);

    // 4. Delete Batch B -> Expected stock: 0
    const delB = await api.deleteProductionBatch(batchB.id, 'Deleting Batch B', 'usr-owner-001');
    expect(delB.success).toBe(true);
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(0);

    // Verify all reversals reference their exact source batch
    const allMovements = mockStore.getStockMovements();
    const revA = allMovements.find((m) => m.reference_id === batchA.id && m.movement_type === 'production_reversal');
    const revB = allMovements.find((m) => m.reference_id === batchB.id && m.movement_type === 'production_reversal');

    expect(revA).toBeDefined();
    expect(revB).toBeDefined();
    expect(revA?.id).not.toBe(revB?.id);
  });

  it('3. Robust Product Identifier Resolution: IDs, SKUs, and Names map seamlessly', async () => {
    const products = mockStore.getProducts();
    const sada = products[0];

    // Direct movement insertion with SKU instead of ID
    mockStore.getState().stock_movements.push({
      id: 'mv-sku-test-01',
      movement_date: new Date().toISOString(),
      product_id: sada.sku, // Stored as SKU 'JK-SADA-01'
      source_location_id: 'loc-prod',
      destination_location_id: 'loc-freezer',
      quantity: 50,
      movement_type: 'production_completed',
      reference_table: 'production_batches',
      reference_id: 'batch-test-sku',
      notes: 'Direct SKU movement',
      created_by: 'usr-owner-001',
      created_at: new Date().toISOString(),
    });

    // Querying by product ID resolves the SKU movement
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(50);
    // Querying by SKU also resolves
    expect(mockStore.getAvailableFreezerStock(sada.sku)).toBe(50);
  });
});
