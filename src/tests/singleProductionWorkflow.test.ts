import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '../lib/mockStore';
import { api } from '../lib/api';
import { calculateProductionCosting } from '../lib/costCalculator';

describe('Single Daily Production Entry & Recipe-Only Calculator Target Flow', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('verifies the complete single daily production workflow and recipe calculator isolation', async () => {
    const products = mockStore.getProducts();
    const sada = products.find((p) => p.sku === 'JK-SADA-01') || products[0];
    const rabri = products.find((p) => p.sku === 'JK-RABRI-02') || products[1];
    const premium = products.find((p) => p.sku === 'JK-PREM-03') || products[2];

    expect(sada).toBeDefined();
    expect(rabri).toBeDefined();
    expect(premium).toBeDefined();

    // 1. Starting Freezer Stock = 0 for all products
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(0);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(0);
    expect(mockStore.getAvailableFreezerStock(premium.id)).toBe(0);

    // 2-6. Save New Production Batch (Sada 360, Rabri 150, Premium 40, Damaged 0, Total Ingredient Cost = ₹500)
    const batch = await api.createProductionBatch(
      '2026-09-02',
      500,
      'Morning Shift Complete Daily Batch',
      [
        { product_id: sada.id, produced_quantity: 360, damaged_quantity: 0 },
        { product_id: rabri.id, produced_quantity: 150, damaged_quantity: 0 },
        { product_id: premium.id, produced_quantity: 40, damaged_quantity: 0 },
      ],
      'usr-owner-001'
    );

    // 7. Production Batch appears in history with automatic proportional cost allocation
    expect(batch).toBeDefined();
    expect(batch.status).toBe('completed');
    expect(batch.total_ingredient_cost).toBe(500);

    const totalNetPieces = 360 + 150 + 40; // 550 pcs
    expect(totalNetPieces).toBe(550);

    const sadaItem = batch.items.find((it: any) => it.product_id === sada.id);
    const rabriItem = batch.items.find((it: any) => it.product_id === rabri.id);
    const premItem = batch.items.find((it: any) => it.product_id === premium.id);

    // Sada: 360/550 * 500 = 327.27 (0.91/pc)
    expect(sadaItem?.saleable_quantity).toBe(360);
    expect(sadaItem?.allocated_ingredient_cost).toBeCloseTo(327.27, 1);
    expect(sadaItem?.unit_production_cost).toBeCloseTo(0.91, 1);

    // Rabri: 150/550 * 500 = 136.36 (0.91/pc)
    expect(rabriItem?.saleable_quantity).toBe(150);
    expect(rabriItem?.allocated_ingredient_cost).toBeCloseTo(136.36, 1);
    expect(rabriItem?.unit_production_cost).toBeCloseTo(0.91, 1);

    // Premium: 40/550 * 500 = 36.36 (0.91/pc)
    expect(premItem?.saleable_quantity).toBe(40);
    expect(premItem?.allocated_ingredient_cost).toBeCloseTo(36.36, 1);
    expect(premItem?.unit_production_cost).toBeCloseTo(0.91, 1);

    // 8. Freezer Stock automatically shows exact produced quantities
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(360);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(150);
    expect(mockStore.getAvailableFreezerStock(premium.id)).toBe(40);

    // 9. Stock Issue screen immediately sees the new available stock
    const productsInStore = mockStore.getProducts();
    expect(productsInStore.find((p) => p.id === sada.id)?.available_quantity).toBe(360);
    expect(productsInStore.find((p) => p.id === rabri.id)?.available_quantity).toBe(150);
    expect(productsInStore.find((p) => p.id === premium.id)?.available_quantity).toBe(40);

    // Stock Issue can issue stock immediately without errors
    const issue = mockStore.issueSellerStock(
      'sel-ramesh-01',
      'cart-01',
      '2026-09-02',
      [
        { product_id: sada.id, issued_quantity: 60 },
        { product_id: rabri.id, issued_quantity: 30 },
      ],
      'Issued morning stock to Ramesh',
      'usr-owner-001'
    );
    expect(issue).toBeDefined();
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(300);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(120);
    expect(mockStore.getAvailableFreezerStock(premium.id)).toBe(40);

    // 10. Persistence check: Stock ledger movements accurately record the transaction
    const movements = mockStore.getStockMovements();
    const batchMovements = movements.filter((m) => m.reference_id === batch.id);
    expect(batchMovements.length).toBe(3);
    expect(batchMovements.every((m) => m.movement_type === 'production_completed')).toBe(true);

    // 11. Open Production Cost Calculator & model recipe costing:
    // Verify editing/modeling in calculator causes ZERO changes to freezer stock
    const milk = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
    const sugar = mockStore.getIngredients().find((i) => i.code === 'ING-SUGAR')!;
    const cardamom = mockStore.getIngredients().find((i) => i.code === 'ING-CARDAMOM')!;

    // Perform recipe cost modeling for Sada Kulfi
    const costing = calculateProductionCosting(
      [
        {
          ingredient_id: milk.id,
          name_en: milk.name_en,
          name_hi: milk.name_hi,
          category: milk.category,
          is_selected: true,
          quantity: 10,
          unit: 'litre',
          rate: 60,
          rate_unit: 'litre',
          calculated_cost: 600,
          save_rate_to_master: false,
        },
        {
          ingredient_id: sugar.id,
          name_en: sugar.name_en,
          name_hi: sugar.name_hi,
          category: sugar.category,
          is_selected: true,
          quantity: 1000,
          unit: 'g',
          rate: 48,
          rate_unit: 'kg',
          calculated_cost: 48,
          save_rate_to_master: false,
        },
        {
          ingredient_id: cardamom.id,
          name_en: cardamom.name_en,
          name_hi: cardamom.name_hi,
          category: cardamom.category,
          is_selected: true,
          quantity: 15,
          unit: 'g',
          rate: 3200,
          rate_unit: 'kg',
          calculated_cost: 48,
          save_rate_to_master: false,
        },
      ],
      {
        electricity: 20,
        generator_fuel: 0,
        gas: 40,
        direct_labour: 50,
        water: 0,
        packaging_extra: 0,
        transport: 10,
        other: 0,
      },
      100,
      0,
      10
    );

    expect(costing.total_ingredient_cost).toBe(696);
    expect(costing.total_batch_cost).toBe(816);
    expect(costing.cost_per_saleable_kulfi).toBe(8.16);

    // Save recipe template version (no production batch or stock movements created)
    mockStore.saveRecipe(
      {
        product_id: sada.id,
        name: 'Sada Kulfi Standard v2 Recipe',
        standard_output_pieces: 100,
        default_overheads: {
          electricity: 20,
          generator_fuel: 0,
          gas: 40,
          direct_labour: 50,
          water: 0,
          packaging_extra: 0,
          transport: 10,
          other: 0,
        },
        items: [
          { ingredient_id: milk.id, quantity: 10, unit: 'litre', rate: 60, save_rate_to_master: false },
          { ingredient_id: sugar.id, quantity: 1000, unit: 'g', rate: 48, save_rate_to_master: false },
          { ingredient_id: cardamom.id, quantity: 15, unit: 'g', rate: 3200, save_rate_to_master: false },
        ],
      },
      'usr-owner-001'
    );

    // Verify freezer stock has NOT changed
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(300); // 360 produced - 60 issued = 300
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(120); // 150 produced - 30 issued = 120
    expect(mockStore.getAvailableFreezerStock(premium.id)).toBe(40);

    // 12. Verify Rate Unit values in master remain unchanged
    const milkMaster = mockStore.getIngredientById(milk.id);
    const sugarMaster = mockStore.getIngredientById(sugar.id);
    const cardMaster = mockStore.getIngredientById(cardamom.id);

    expect(milkMaster?.rate_unit).toBe('litre');
    expect(sugarMaster?.rate_unit).toBe('kg');
    expect(cardMaster?.rate_unit).toBe('kg'); // Cardamom rate_unit remains 'kg', never 'g'!
  });
});
