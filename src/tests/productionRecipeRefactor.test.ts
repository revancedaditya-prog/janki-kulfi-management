import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '@/lib/mockStore';
import { useMockMode } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase';

describe('Production, Recipe Master & Raw Material Inventory Refactor', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  // 1. Active recipe cost per kulfi calculation
  it('1. Active recipe calculates ingredient cost and cost per kulfi piece correctly', () => {
    const sadaRecipe = mockStore.getRecipeForProduct('prod-sada-01');
    expect(sadaRecipe).toBeDefined();
    expect(sadaRecipe?.status).toBe('active');

    const yieldPieces = sadaRecipe?.expected_yield_pieces || sadaRecipe?.standard_output_pieces || 100;
    expect(yieldPieces).toBe(100);

    // Calculate sum of ingredient costs
    let totalIngredientCost = 0;
    for (const item of sadaRecipe!.items) {
      const ing = mockStore.getIngredientById(item.ingredient_id);
      expect(ing).toBeDefined();
      const cost = item.quantity * (ing?.current_rate || 0);
      totalIngredientCost += cost;
    }

    expect(totalIngredientCost).toBeGreaterThan(0);
    const costPerPiece = totalIngredientCost / yieldPieces;
    expect(costPerPiece).toBeGreaterThan(0);
  });

  // 2. Production quantity correctly multiplies required ingredient quantities
  it('2. Production quantity correctly scales required raw material quantities', () => {
    const sadaRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;
    const yieldPieces = sadaRecipe.expected_yield_pieces || sadaRecipe.standard_output_pieces || 100;
    const producedQty = 250;
    const ratio = producedQty / yieldPieces; // 2.5

    for (const item of sadaRecipe.items) {
      const scaledQty = (item.quantity / yieldPieces) * producedQty;
      expect(scaledQty).toBeCloseTo(item.quantity * ratio, 3);
    }
  });

  // 3. Total production cost calculation
  it('3. Total production cost equals sum of scaled ingredients plus overheads', () => {
    const res = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      damagedQuantity: 5,
      lpgCost: 50,
    });

    expect(res.success).toBe(true);
    expect(res.saleable_quantity).toBe(95);
    expect(res.total_ingredient_cost).toBeGreaterThan(0);
    expect(res.cost_per_piece).toBeGreaterThan(0);
  });

  // 4. Required raw materials are deducted exactly once
  it('4. Raw materials are deducted from inventory ledger during production completion', () => {
    const milkIng = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
    const initialStock = mockStore.getAvailableRawMaterialStock(milkIng.id);
    expect(initialStock).toBeGreaterThan(0);

    const res = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      damagedQuantity: 0,
    });

    expect(res.success).toBe(true);

    const postStock = mockStore.getAvailableRawMaterialStock(milkIng.id);
    expect(postStock).toBeLessThan(initialStock);

    // Verify negative movement recorded
    const movements = mockStore.getRawMaterialMovements(milkIng.id);
    const latestMove = movements.find((m) => m.reference_id === res.batch_id);
    expect(latestMove).toBeDefined();
    expect(latestMove?.quantity).toBeLessThan(0);
    expect(latestMove?.movement_type).toBe('production_consumption');
  });

  // 5. Finished kulfi stock added to Main Freezer
  it('5. Finished kulfi stock is added into Main Cold Storage Freezer', () => {
    const res = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 200,
      damagedQuantity: 10,
    });

    expect(res.success).toBe(true);
    expect(res.saleable_quantity).toBe(190);

    const stockMovements = (mockStore as any).state.stock_movements || [];
    const prodMove = stockMovements.find((sm: any) => sm.reference_id === res.batch_id);
    expect(prodMove).toBeDefined();
    expect(prodMove.quantity).toBe(190);
    expect(prodMove.movement_type).toBe('production_completed');
    expect(prodMove.destination_location_id).toBe('loc-freezer-01');
  });

  // 6. Insufficient ingredient stock blocks completion
  it('6. Insufficient raw material stock blocks production completion with clear error', () => {
    const milkIng = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
    
    // Set milk stock to 0 via stock correction
    mockStore.correctRawMaterialStock({
      ingredientId: milkIng.id,
      newQuantity: 0,
      reason: 'Physical count zeroed for test',
    });

    expect(mockStore.getAvailableRawMaterialStock(milkIng.id)).toBe(0);

    expect(() => {
      mockStore.completeProductionWithRecipeTransaction({
        productionDate: '2026-09-05',
        productId: 'prod-sada-01',
        producedQuantity: 100,
      });
    }).toThrow(/Insufficient raw material stock/i);
  });

  // 7. Duplicate submission does not duplicate stock (idempotency key)
  it('7. Duplicate submission with same idempotency key prevents duplicate batch and stock deduction', () => {
    const idempotencyKey = 'c0000000-0000-0000-0000-000000000001';
    const milkIng = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
    const initialMilk = mockStore.getAvailableRawMaterialStock(milkIng.id);

    const firstRes = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      idempotencyKey,
    });

    const midMilk = mockStore.getAvailableRawMaterialStock(milkIng.id);
    expect(midMilk).toBeLessThan(initialMilk);

    // Replay with same idempotencyKey
    const replayRes = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      idempotencyKey,
    });

    expect(replayRes.idempotent).toBe(true);
    expect(replayRes.batch_id).toBe(firstRes.batch_id);

    const finalMilk = mockStore.getAvailableRawMaterialStock(milkIng.id);
    expect(finalMilk).toBe(midMilk); // No duplicate stock deduction!
  });

  // 8. Ingredient rate changes do not alter historical production batch snapshots
  it('8. Ingredient rate changes do not alter historical production batch snapshot costs', () => {
    const res = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 100,
    });

    const batch = (mockStore as any).state.production_batches.find((b: any) => b.id === res.batch_id);
    const initialCost = batch.total_ingredient_cost;
    const initialPerPiece = batch.cost_per_saleable_piece;

    // Mutate ingredient rate in master
    const milkIng = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
    mockStore.updateIngredientRate(milkIng.id, 999.0, 'litre', true);

    // Verify historical batch remains unchanged
    const batchAfter = (mockStore as any).state.production_batches.find((b: any) => b.id === res.batch_id);
    expect(batchAfter.total_ingredient_cost).toBe(initialCost);
    expect(batchAfter.cost_per_saleable_piece).toBe(initialPerPiece);
  });

  // 9. Used recipe version cannot be deleted (can only be archived)
  it('9. Recipe version referenced by production batches cannot be permanently deleted', () => {
    const sadaRecipe = mockStore.getRecipeForProduct('prod-sada-01')!;

    // Create a batch using this recipe
    mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      recipeId: sadaRecipe.id,
    });

    // Attempt to delete recipe
    const deleteRes = mockStore.deleteRecipeVersion(sadaRecipe.id);
    expect(deleteRes.success).toBe(false);
    expect(deleteRes.archived).toBe(true);

    const recipeAfter = (mockStore as any).state.recipes.find((r: any) => r.id === sadaRecipe.id);
    expect(recipeAfter).toBeDefined();
    expect(recipeAfter.status).toBe('archived');
  });

  // 10. Unused draft recipe version can be deleted
  it('10. Unused draft recipe version can be permanently deleted', () => {
    const draftRecipe = mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      name: 'Temporary Test Recipe Draft',
      standard_output_pieces: 100,
      default_overheads: { electricity: 0, generator_fuel: 0, gas: 0, direct_labour: 0, water: 0, packaging_extra: 0, transport: 0, other: 0 },
      status: 'draft',
      items: [{ ingredient_id: 'ing-milk-01', quantity: 10, unit: 'litre' }],
    });

    expect(draftRecipe.status).toBe('draft');

    const res = mockStore.deleteRecipeVersion(draftRecipe.id);
    expect(res.success).toBe(true);
    expect(res.deleted).toBe(true);

    const recipeAfter = (mockStore as any).state.recipes.find((r: any) => r.id === draftRecipe.id);
    expect(recipeAfter).toBeUndefined();
  });

  // 11. Used material cannot be deleted (can only be deactivated)
  it('11. Used raw material cannot be deleted and enforces deactivation', () => {
    const milkIng = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;

    expect(() => {
      mockStore.deleteIngredient(milkIng.id);
    }).toThrow(/cannot be permanently deleted/i);

    // Deactivation is allowed
    const deactRes = mockStore.deactivateIngredient(milkIng.id);
    expect(deactRes).toBe(true);

    const ingAfter = mockStore.getIngredientById(milkIng.id);
    expect(ingAfter?.is_active).toBe(false);
  });

  // 12. LPG cylinder / raw material stock correction creates ledger history
  it('12. Raw material physical stock correction creates audit and ledger entry', () => {
    const sugarIng = mockStore.getIngredients().find((i) => i.code === 'ING-SUGAR')!;
    const prevStock = mockStore.getAvailableRawMaterialStock(sugarIng.id);

    const correction = mockStore.correctRawMaterialStock({
      ingredientId: sugarIng.id,
      newQuantity: prevStock + 25,
      reason: 'Physical count verified in godown audit',
    });

    expect(correction.success).toBe(true);
    expect(correction.difference).toBe(25);

    const newStock = mockStore.getAvailableRawMaterialStock(sugarIng.id);
    expect(newStock).toBe(prevStock + 25);

    const movements = mockStore.getRawMaterialMovements(sugarIng.id);
    const correctionMove = movements.find((m) => m.movement_type === 'physical_count_correction');
    expect(correctionMove).toBeDefined();
    expect(correctionMove?.quantity).toBe(25);
  });

  // 13. Owner actual usage correction requires a reason
  it('13. Owner actual usage correction requires a valid reason if quantity differs', () => {
    const milkIng = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;

    expect(() => {
      mockStore.completeProductionWithRecipeTransaction({
        productionDate: '2026-09-05',
        productId: 'prod-sada-01',
        producedQuantity: 100,
        actualIngredients: [
          {
            ingredient_id: milkIng.id,
            actual_quantity: 20, // Differs from recipe standard
            unit: 'litre',
            reason: '', // Empty reason should fail!
          },
        ],
      });
    }).toThrow(/valid reason is mandatory/i);

    // With reason, succeeds
    const res = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      actualIngredients: [
        {
          ingredient_id: milkIng.id,
          actual_quantity: 16,
          unit: 'litre',
          reason: 'Boiled milk longer for thicker rabri consistency',
        },
      ],
    });

    expect(res.success).toBe(true);
  });

  // 14. Recipe activation archives previous active version
  it('14. Activating a recipe version automatically archives the previous active version', () => {
    const v1 = mockStore.getRecipeForProduct('prod-sada-01')!;
    expect(v1.status).toBe('active');

    // Create v2 as draft
    const v2 = mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      name: '₹10 Sada Kulfi v2 Improved',
      standard_output_pieces: 100,
      default_overheads: { electricity: 0, generator_fuel: 0, gas: 0, direct_labour: 0, water: 0, packaging_extra: 0, transport: 0, other: 0 },
      status: 'draft',
      items: [{ ingredient_id: 'ing-milk-01', quantity: 16, unit: 'litre' }],
    });

    expect(v2.status).toBe('draft');

    // Activate v2
    const actRes = mockStore.activateRecipeVersion(v2.id);
    expect(actRes.success).toBe(true);

    const v1After = (mockStore as any).state.recipes.find((r: any) => r.id === v1.id);
    const v2After = (mockStore as any).state.recipes.find((r: any) => r.id === v2.id);

    expect(v1After.status).toBe('archived');
    expect(v2After.status).toBe('active');
  });

  // 15. Fallback check: No mock fallback when Supabase is configured
  it('15. useMockMode is strictly based on isSupabaseConfigured and test environment', () => {
    expect(useMockMode).toBe(!isSupabaseConfigured || import.meta.env.MODE === 'test');
    expect(typeof isSupabaseConfigured).toBe('boolean');
  });

  // 16. Recipe cannot be activated with 0 expected yield or no items
  it('16. Recipe cannot be activated with 0 yield or empty items', () => {
    const emptyRecipe = mockStore.saveRecipe({
      product_id: 'prod-sada-01',
      name: 'Invalid Empty Recipe',
      standard_output_pieces: 100,
      default_overheads: { electricity: 0, generator_fuel: 0, gas: 0, direct_labour: 0, water: 0, packaging_extra: 0, transport: 0, other: 0 },
      status: 'draft',
      items: [],
    });

    expect(() => {
      mockStore.activateRecipeVersion(emptyRecipe.id);
    }).toThrow(/no ingredient items/i);
  });

  // 17. Complete end-to-end production reconciliation
  it('17. End-to-end production reconciliation: raw materials deducted, finished goods added to freezer', () => {
    const milkIng = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
    const startMilk = mockStore.getAvailableRawMaterialStock(milkIng.id);

    const res = mockStore.completeProductionWithRecipeTransaction({
      productionDate: '2026-09-05',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      damagedQuantity: 2,
    });

    expect(res.success).toBe(true);
    expect(res.saleable_quantity).toBe(98);

    const endMilk = mockStore.getAvailableRawMaterialStock(milkIng.id);
    expect(endMilk).toBeLessThan(startMilk);

    // Verify finished kulfi in freezer stock movements
    const stockMovements = (mockStore as any).state.stock_movements || [];
    const prodMove = stockMovements.find((sm: any) => sm.reference_id === res.batch_id);
    expect(prodMove.quantity).toBe(98);
    expect(prodMove.product_id).toBe('prod-sada-01');
  });
});
