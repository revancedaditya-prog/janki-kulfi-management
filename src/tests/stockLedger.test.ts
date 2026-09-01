import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '@/lib/mockStore';

describe('Authoritative Stock Ledger & Inventory Movements', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('should initialize with zero stock in main freezer for all products', () => {
    const products = mockStore.getProducts();
    for (const p of products) {
      expect(mockStore.getAvailableFreezerStock(p.id)).toBe(0);
    }
  });

  it('should credit main freezer upon completing production batch', () => {
    const products = mockStore.getProducts();
    const sada = products[0];
    const rabri = products[1];

    // Create and complete batch of 100 Sada (2 damaged) and 50 Rabri (0 damaged)
    const batch = mockStore.createProductionBatch(
      '2026-08-31',
      600,
      'Morning shift batch',
      [
        { product_id: sada.id, produced_quantity: 100, damaged_quantity: 2 },
        { product_id: rabri.id, produced_quantity: 50, damaged_quantity: 0 },
      ],
      'usr-owner-001'
    );

    // Before completion: freezer stock is still 0
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(0);

    // Complete batch
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    // After completion: 98 Sada, 50 Rabri in freezer
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(98);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(50);
  });

  it('should reject stock issue if requested quantity exceeds freezer stock', () => {
    const products = mockStore.getProducts();
    const sada = products[0];
    const sellers = mockStore.getSellers();
    const seller = sellers[0];

    // Try issuing 10 pieces when 0 are available
    expect(() =>
      mockStore.issueSellerStock(
        seller.id,
        seller.default_cart_id || null,
        '2026-08-31',
        [{ product_id: sada.id, issued_quantity: 10 }],
        'Test issue',
        'usr-owner-001'
      )
    ).toThrow('Insufficient freezer stock');
  });

  it('should deduct freezer stock and credit seller held stock upon stock issue', () => {
    const products = mockStore.getProducts();
    const sada = products[0];
    const seller = mockStore.getSellers()[0];

    // 1. Produce 100
    const batch = mockStore.createProductionBatch(
      '2026-08-31',
      400,
      'Batch 1',
      [{ product_id: sada.id, produced_quantity: 100, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(100);

    // 2. Issue 40 to seller
    mockStore.issueSellerStock(
      seller.id,
      seller.default_cart_id || null,
      '2026-08-31',
      [{ product_id: sada.id, issued_quantity: 40 }],
      'Morning issue',
      'usr-owner-001'
    );

    // Freezer stock decreased to 60
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(60);
    // Seller held stock increased to 40
    expect(mockStore.getSellerHeldStock(seller.id, sada.id)).toBe(40);
  });
});
