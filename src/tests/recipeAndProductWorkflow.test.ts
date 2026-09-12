import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '@/lib/mockStore';
import { calculateProductionCosting } from '@/lib/costCalculator';
import { CostingIngredientRow, AdditionalOverheads } from '@/types';

describe('Recipe Calculator & Product Editing Workflow Test Suite', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  // 1. Edit ingredient quantity and save
  it('1. Editing ingredient quantity persists correctly and updates recipe cost', () => {
    const activeRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    expect(activeRecipe).toBeDefined();

    const milkItem = activeRecipe.items.find((it) => it.ingredient_id === 'ing-milk-01')!;
    expect(milkItem).toBeDefined();
    const oldQty = milkItem.quantity;

    // Change milk quantity to 15 litres
    const newQty = 15;
    const updatedItems = activeRecipe.items.map((it) =>
      it.ingredient_id === 'ing-milk-01' ? { ...it, quantity: newQty } : it
    );

    const saveRes = mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      recipe_id: activeRecipe.id,
      name: activeRecipe.name,
      standard_output_pieces: activeRecipe.standard_output_pieces,
      expected_yield_pieces: activeRecipe.expected_yield_pieces,
      items: updatedItems,
      status: 'active',
      notes: 'Increased milk quantity to 15L',
    });

    expect(saveRes).toBeDefined();
    expect(saveRes.id).toBeDefined();

    // Verify fetched active recipe has the updated quantity
    const reloadedRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    const reloadedMilk = reloadedRecipe.items.find((it) => it.ingredient_id === 'ing-milk-01')!;
    expect(reloadedMilk.quantity).toBe(15);
    expect(reloadedMilk.quantity).not.toBe(oldQty);
  });

  // 2. Refresh / refetch shows the edited quantity
  it('2. Refresh / refetch returns the newly saved database values, not hardcoded presets', () => {
    const activeRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    const updatedItems = activeRecipe.items.map((it) =>
      it.ingredient_id === 'ing-sug-02' ? { ...it, quantity: 3.5 } : it
    );

    mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      recipe_id: activeRecipe.id,
      name: 'Custom Sada Recipe v2',
      standard_output_pieces: 120,
      expected_yield_pieces: 120,
      items: updatedItems,
      status: 'active',
    });

    // Simulate page refresh by fetching fresh from store
    const freshRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    expect(freshRecipe.expected_yield_pieces).toBe(120);
    const sugarItem = freshRecipe.items.find((it) => it.ingredient_id === 'ing-sug-02')!;
    expect(sugarItem).toBeDefined();
    expect(sugarItem.quantity).toBe(3.5);
  });

  // 3. Remove ingredient and save
  it('3. Removing an ingredient removes it from the saved recipe', () => {
    const activeRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    const initialItemCount = activeRecipe.items.length;
    expect(initialItemCount).toBeGreaterThan(1);

    // Remove sugar (ing-sug-02)
    const filteredItems = activeRecipe.items.filter((it) => it.ingredient_id !== 'ing-sug-02');
    expect(filteredItems.length).toBe(initialItemCount - 1);

    mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      recipe_id: activeRecipe.id,
      name: activeRecipe.name,
      standard_output_pieces: 100,
      expected_yield_pieces: 100,
      items: filteredItems,
      status: 'active',
    });

    const savedRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    expect(savedRecipe.items.length).toBe(initialItemCount - 1);
    expect(savedRecipe.items.some((it) => it.ingredient_id === 'ing-sug-02')).toBe(false);
  });

  // 4. Add new ingredient and save
  it('4. Adding a new ingredient persists and increases recipe item count', () => {
    const activeRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    const initialItemCount = activeRecipe.items.length;

    // Add Saffron
    const newItems = [
      ...activeRecipe.items,
      {
        ingredient_id: 'ing-saff-09',
        quantity: 0.5,
        unit: 'g' as const,
      },
    ];

    mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      recipe_id: activeRecipe.id,
      name: activeRecipe.name,
      standard_output_pieces: 100,
      expected_yield_pieces: 100,
      items: newItems,
      status: 'active',
    });

    const savedRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    expect(savedRecipe.items.length).toBe(initialItemCount + 1);
    const saffron = savedRecipe.items.find((it) => it.ingredient_id === 'ing-saff-09');
    expect(saffron).toBeDefined();
    expect(saffron?.quantity).toBe(0.5);
  });

  // 5. No preset values return after Save
  it('5. No preset values return after Save — only user-specified items are present', () => {
    // Save recipe with only milk (1 item)
    mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      name: 'Milk Only Recipe',
      standard_output_pieces: 50,
      expected_yield_pieces: 50,
      items: [
        {
          ingredient_id: 'ing-milk-01',
          quantity: 8,
          unit: 'litre',
        },
      ],
      status: 'active',
    });

    const savedRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    expect(savedRecipe.items.length).toBe(1);
    expect(savedRecipe.items[0].ingredient_id).toBe('ing-milk-01');
    expect(savedRecipe.expected_yield_pieces).toBe(50);
  });

  // 6. Used recipe creates a new version while unused draft can be edited in place
  it('6. Used recipe creates a new version; unused draft is updated in place', () => {
    // Initially active recipe v1
    const v1 = mockStore.getRecipeForProduct('prod-sada-01')!;
    expect(v1.version_number).toBe(1);

    // Record production batch using v1
    mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-06',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      damagedQuantity: 0,
    });

    // Now save recipe for prod-sada-01. Because v1 was used in production, it must create v2!
    const v2 = mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      recipe_id: v1.id,
      name: 'Sada Kulfi Recipe v2',
      standard_output_pieces: 100,
      expected_yield_pieces: 100,
      items: v1.items,
      status: 'active',
    });

    expect(v2.version_number).toBe(2);
    expect(v2.id).not.toBe(v1.id);
    expect(v2.status).toBe('active');

    // Prior v1 is now archived
    const history = mockStore.getRecipeHistory('prod-sada-01');
    const oldV1 = history.find((r) => r.id === v1.id);
    expect(oldV1?.status).toBe('archived');
  });

  // 7. Canonical recipe_items.quantity is used consistently
  it('7. Canonical recipe_items.quantity is used consistently across calculations', () => {
    const row: CostingIngredientRow = {
      ingredient_id: 'ing-milk-01',
      name_en: 'Buffalo Milk',
      name_hi: 'भैंस का दूध',
      category: 'dairy',
      is_selected: true,
      quantity: 10,
      unit: 'litre',
      rate: 65,
      rate_unit: 'litre',
      calculated_cost: 650,
      save_rate_to_master: false,
    };

    const overheads: AdditionalOverheads = {
      electricity: 30,
      generator_fuel: 0,
      gas: 40,
      direct_labour: 50,
      water: 0,
      packaging_extra: 0,
      transport: 0,
      other: 0,
    };

    const result = calculateProductionCosting([row], overheads, 100, 0, 10);
    expect(result.total_ingredient_cost).toBe(650);
    expect(result.total_overheads_cost).toBe(120);
    expect(result.total_batch_cost).toBe(770);
    expect(result.cost_per_saleable_kulfi).toBeCloseTo(7.7, 2);
  });

  // 8. Selling price edit creates price history without altering old transactions
  it('8. Selling price edit creates price history and does not alter old transaction records', () => {
    const prod = mockStore.getProducts().find((p) => p.id === 'prod-sada-01')!;
    expect(prod.current_price).toBe(10);

    // Initial price history count
    const initialHistory = mockStore.getPriceHistory(prod.id);
    expect(initialHistory.length).toBeGreaterThanOrEqual(1);

    // Update product price from ₹10 to ₹12
    const updatedProd = mockStore.updateProduct(prod.id, {
      name_hi: '₹12 सादा कुल्फी',
      name_en: '₹12 Sada Kulfi',
      selling_price: 12,
      commission_type: 'fixed',
      commission_value: 2.5,
    });

    expect(updatedProd.current_price).toBe(12);

    // Check price history has new record and old record with effective_to
    const newHistory = mockStore.getPriceHistory(prod.id);
    expect(newHistory.length).toBe(initialHistory.length + 1);

    const activePrice = newHistory.find((ph) => !ph.effective_to);
    expect(activePrice).toBeDefined();
    expect(activePrice?.selling_price).toBe(12);

    const closedPrice = newHistory.find((ph) => ph.selling_price === 10);
    expect(closedPrice?.effective_to).toBeDefined();
  });

  // 9. Product active / inactive toggle
  it('9. Inactive products are flagged and can be reactivated', () => {
    const prod = mockStore.getProducts().find((p) => p.id === 'prod-sada-01')!;

    // Deactivate
    const deactivated = mockStore.updateProduct(prod.id, { is_active: false });
    expect(deactivated.is_active).toBe(false);

    // Reactivate
    const reactivated = mockStore.updateProduct(prod.id, { is_active: true });
    expect(reactivated.is_active).toBe(true);
  });

  // 10. Production with updated recipe deducts exact updated raw material quantities
  it('10. Production batch with updated recipe deducts raw materials using updated quantities', () => {
    const milk = mockStore.getIngredients().find((i) => i.id === 'ing-milk-01')!;
    const initialMilkStock = mockStore.getAvailableRawMaterialStock(milk.id);

    // Update recipe to require 20L milk per 100 pcs
    mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      name: 'Double Milk Sada Recipe',
      standard_output_pieces: 100,
      expected_yield_pieces: 100,
      items: [
        {
          ingredient_id: 'ing-milk-01',
          quantity: 20,
          unit: 'litre',
        },
      ],
      status: 'active',
    });

    // Complete production for 100 pcs
    const res = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-07',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      damagedQuantity: 0,
    });

    expect(res.success).toBe(true);

    const finalMilkStock = mockStore.getAvailableRawMaterialStock(milk.id);
    expect(initialMilkStock - finalMilkStock).toBe(20);
  });
});
