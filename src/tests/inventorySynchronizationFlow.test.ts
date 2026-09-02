import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '../lib/mockStore';
import { calculateIngredientRowCost } from '../lib/costCalculator';

describe('Complete Inventory Synchronization & Rate Calculator Flow', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('executes the full 19-step inventory and rate calculator test scenario accurately', () => {
    const products = mockStore.getProducts();
    const rabri = products.find((p) => p.sku === 'JK-RABRI-02') || products[1];
    expect(rabri).toBeDefined();

    // 1. Starting freezer stock = 0
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(0);

    // 2. Complete production of 300 pcs
    const batch = mockStore.createProductionBatch(
      '2026-09-02',
      1500,
      'Batch 300 pcs Rabri',
      [{ product_id: rabri.id, produced_quantity: 300, damaged_quantity: 0 }],
      'usr-owner-001'
    );
    mockStore.completeProductionBatch(batch.id, 'usr-owner-001');

    // 3. Freezer Stock must show 300
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(300);

    // 4. Stock Issue screen must show 300 available
    const productsAfterProd = mockStore.getProducts();
    const rabriAfterProd = productsAfterProd.find((p) => p.id === rabri.id);
    expect(rabriAfterProd?.available_quantity).toBe(300);

    // 5. Issue 80
    const issue = mockStore.issueSellerStock(
      'sel-ramesh-01',
      'cart-01',
      '2026-09-02',
      [{ product_id: rabri.id, issued_quantity: 80 }],
      'Issue 80 to Ramesh',
      'usr-owner-001'
    );

    // 6. Freezer Stock must show 220
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(220);
    expect(mockStore.getProducts().find((p) => p.id === rabri.id)?.available_quantity).toBe(220);

    // 7. Edit issue 80 -> 60
    mockStore.correctSellerIssue(
      issue.id,
      '2026-09-02',
      'sel-ramesh-01',
      'cart-01',
      [{ product_id: rabri.id, issued_quantity: 60 }],
      'Corrected issue from 80 to 60',
      'Reduced count due to error',
      'usr-owner-001'
    );

    // 8. Freezer Stock must show 240
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(240);
    expect(mockStore.getProducts().find((p) => p.id === rabri.id)?.available_quantity).toBe(240);

    // 9. Delete the issue
    mockStore.deleteSellerIssue(issue.id, 'Deleted test issue', 'usr-owner-001');

    // 10. Freezer Stock must return to 300
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(300);
    expect(mockStore.getProducts().find((p) => p.id === rabri.id)?.available_quantity).toBe(300);

    // 11. Edit Production 300 -> 280
    mockStore.correctProductionBatch(
      batch.id,
      '2026-09-02',
      1400,
      'Updated batch note',
      [{ product_id: rabri.id, produced_quantity: 280, damaged_quantity: 0 }],
      'Count adjustment due to recounting',
      'usr-owner-001'
    );

    // 12. Freezer Stock must show 280
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(280);
    expect(mockStore.getProducts().find((p) => p.id === rabri.id)?.available_quantity).toBe(280);

    // 13. Manually adjust Freezer Stock 280 -> 270
    const adjRes = mockStore.adjustFreezerStock(rabri.id, 270, 'Physical count difference', 'usr-owner-001');
    expect(adjRes.success).toBe(true);
    expect(adjRes.previousQuantity).toBe(280);
    expect(adjRes.newQuantity).toBe(270);
    expect(adjRes.difference).toBe(-10);

    // 14. Freezer Stock must show 270
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(270);
    expect(mockStore.getProducts().find((p) => p.id === rabri.id)?.available_quantity).toBe(270);

    // 15. Delete/reset that freezer stock entry using the new Owner Delete function (reset to 0)
    const delRes = mockStore.adjustFreezerStock(rabri.id, 0, 'Cleared remaining stock', 'usr-owner-001');
    expect(delRes.success).toBe(true);
    expect(delRes.newQuantity).toBe(0);
    expect(delRes.difference).toBe(-270);

    // 16. Inventory must reach 0 without negative stock or orphan movements
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(0);
    expect(mockStore.getProducts().find((p) => p.id === rabri.id)?.available_quantity).toBe(0);

    // 17. Verify all corresponding History/Audit entries
    const audits = mockStore.getAuditLogs();
    expect(audits.some((a) => a.action === 'FREEZER_STOCK_ADJUSTMENT')).toBe(true);
    expect(audits.some((a) => a.action === 'DELETE_ISSUE')).toBe(true);

    // 18. Open Rate Calculator and perform multiple calculations
    const milk = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
    const sugar = mockStore.getIngredients().find((i) => i.code === 'ING-SUGAR')!;
    const card = mockStore.getIngredients().find((i) => i.code === 'ING-CARDAMOM')!;

    expect(milk.rate_unit).toBe('litre');
    expect(sugar.rate_unit).toBe('kg');
    expect(card.rate_unit).toBe('kg');

    // Row cost calculation for 500g sugar with rate ₹48/kg -> should be ₹24
    const sugarCost = calculateIngredientRowCost(500, 'g', 48, 'kg');
    expect(sugarCost).toBe(24);

    // Row cost calculation for 20g cardamom with rate ₹2400/kg -> should be ₹48
    const cardCost = calculateIngredientRowCost(20, 'g', 2400, 'kg');
    expect(cardCost).toBe(48);

    // Save recipe where line items use 'g' and 'ml'
    mockStore.saveRecipe(
      {
        product_id: rabri.id,
        name: 'Rabri Test Recipe',
        standard_output_pieces: 100,
        default_overheads: {
          electricity: 20,
          generator_fuel: 0,
          gas: 30,
          direct_labour: 50,
          water: 0,
          packaging_extra: 0,
          transport: 0,
          other: 0,
        },
        items: [
          { ingredient_id: milk.id, quantity: 5, unit: 'litre', save_rate_to_master: true, rate: 60 },
          { ingredient_id: sugar.id, quantity: 500, unit: 'g', save_rate_to_master: true, rate: 48 },
          { ingredient_id: card.id, quantity: 20, unit: 'g', save_rate_to_master: true, rate: 2400 },
        ],
      },
      'usr-owner-001'
    );

    // 19. Confirm the saved Rate Unit has NOT changed!
    const milkAfter = mockStore.getIngredientById(milk.id)!;
    const sugarAfter = mockStore.getIngredientById(sugar.id)!;
    const cardAfter = mockStore.getIngredientById(card.id)!;

    expect(milkAfter.rate_unit).toBe('litre');
    expect(sugarAfter.rate_unit).toBe('kg'); // must NOT have changed to 'g'!
    expect(cardAfter.rate_unit).toBe('kg');  // must NOT have changed to 'g'!
  });
});
