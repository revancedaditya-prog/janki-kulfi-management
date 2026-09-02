import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertUnitQuantity,
  calculateIngredientRowCost,
  calculateProductionCosting,
  scaleProductionRecipe,
} from '@/lib/costCalculator';
import { mockStore } from '@/lib/mockStore';
import { CostingIngredientRow, AdditionalOverheads, RecipeWithItems } from '@/types';

describe('Production Cost Calculator - Unit Conversion & Costing Formulas', () => {
  it('0. Unit conversion: kg to g and litre to ml', () => {
    expect(convertUnitQuantity(1.5, 'kg', 'g')).toBe(1500);
    expect(convertUnitQuantity(500, 'g', 'kg')).toBe(0.5);
    expect(convertUnitQuantity(2, 'litre', 'ml')).toBe(2000);
    expect(convertUnitQuantity(750, 'ml', 'litre')).toBe(0.75);
  });

  it('1. Milk cost calculation: 20 litres at ₹60/litre = ₹1,200', () => {
    const cost = calculateIngredientRowCost(20, 'litre', 60, 'litre');
    expect(cost).toBe(1200);
  });

  it('2. Sugar kg-to-gram conversion: 500 g at ₹48/kg = ₹24', () => {
    const cost = calculateIngredientRowCost(500, 'g', 48, 'kg');
    expect(cost).toBe(24);
  });

  it('3. Dry-fruit kg-to-gram conversion: 50 g cashew at ₹800/kg = ₹40', () => {
    const cost = calculateIngredientRowCost(50, 'g', 800, 'kg');
    expect(cost).toBe(40);
  });

  it('4. Packaging per piece costing: 100 sticks at ₹0.30/piece = ₹30', () => {
    const cost = calculateIngredientRowCost(100, 'piece', 0.3, 'piece');
    expect(cost).toBe(30);
  });

  it('5. Volume conversion: 250 ml flavour at ₹1.50/ml = ₹375, and 500 ml at ₹100/litre = ₹50', () => {
    const costSameUnit = calculateIngredientRowCost(250, 'ml', 1.5, 'ml');
    expect(costSameUnit).toBe(375);

    const costConverted = calculateIngredientRowCost(500, 'ml', 100, 'litre');
    expect(costConverted).toBe(50);
  });

  it('6. Selected vs unselected ingredients: unselected ingredients must not be included in costing', () => {
    const rows: CostingIngredientRow[] = [
      {
        ingredient_id: 'ing-milk',
        name_en: 'Milk',
        name_hi: 'दूध',
        category: 'dairy',
        is_selected: true,
        quantity: 10,
        unit: 'litre',
        rate: 60,
        rate_unit: 'litre',
        calculated_cost: 600,
      },
      {
        ingredient_id: 'ing-saffron',
        name_en: 'Saffron',
        name_hi: 'केसर',
        category: 'spice',
        is_selected: false, // Unselected
        quantity: 5,
        unit: 'g',
        rate: 250,
        rate_unit: 'g',
        calculated_cost: 1250,
      },
    ];

    const overheads: AdditionalOverheads = {
      electricity: 0,
      generator_fuel: 0,
      gas: 0,
      direct_labour: 0,
      water: 0,
      packaging_extra: 0,
      transport: 0,
      other: 0,
    };

    const res = calculateProductionCosting(rows, overheads, 100, 0, 10);
    expect(res.total_ingredient_cost).toBe(600); // Only milk is counted
    expect(res.saffron_cost).toBe(0);
    expect(res.milk_cost).toBe(600);
  });

  it('7. Missing-rate validation flags missing rate when ingredient is selected with quantity > 0', () => {
    const rows: CostingIngredientRow[] = [
      {
        ingredient_id: 'ing-milk',
        name_en: 'Milk',
        name_hi: 'दूध',
        category: 'dairy',
        is_selected: true,
        quantity: 10,
        unit: 'litre',
        rate: 0, // Missing rate
        rate_unit: 'litre',
        calculated_cost: 0,
      },
    ];

    const overheads: AdditionalOverheads = {
      electricity: 0,
      generator_fuel: 0,
      gas: 0,
      direct_labour: 0,
      water: 0,
      packaging_extra: 0,
      transport: 0,
      other: 0,
    };

    const res = calculateProductionCosting(rows, overheads, 100, 0, 10);
    expect(res.missing_rate_ingredients).toContain('दूध');
  });

  it('8. Batch total calculation combines all selected ingredients and overheads', () => {
    const rows: CostingIngredientRow[] = [
      {
        ingredient_id: 'ing-milk',
        name_en: 'Milk',
        name_hi: 'दूध',
        category: 'dairy',
        is_selected: true,
        quantity: 10,
        unit: 'litre',
        rate: 60,
        rate_unit: 'litre',
        calculated_cost: 600,
      },
      {
        ingredient_id: 'ing-sugar',
        name_en: 'Sugar',
        name_hi: 'चीनी',
        category: 'sweetener',
        is_selected: true,
        quantity: 1,
        unit: 'kg',
        rate: 48,
        rate_unit: 'kg',
        calculated_cost: 48,
      },
      {
        ingredient_id: 'ing-stick',
        name_en: 'Kulfi stick',
        name_hi: 'कुल्फी स्टिक',
        category: 'packaging',
        is_selected: true,
        quantity: 100,
        unit: 'piece',
        rate: 0.3,
        rate_unit: 'piece',
        calculated_cost: 30,
      },
    ];

    const overheads: AdditionalOverheads = {
      electricity: 20,
      generator_fuel: 0,
      gas: 50,
      direct_labour: 60,
      water: 0,
      packaging_extra: 0,
      transport: 10,
      other: 10,
    };

    const res = calculateProductionCosting(rows, overheads, 100, 0, 10);
    expect(res.total_ingredient_cost).toBe(678); // 600 + 48 + 30
    expect(res.total_overheads_cost).toBe(150); // 20 + 50 + 60 + 10 + 10
    expect(res.total_batch_cost).toBe(828); // 678 + 150
  });

  it('9. Cost per saleable kulfi divides total batch cost by saleable pieces', () => {
    const rows: CostingIngredientRow[] = [
      {
        ingredient_id: 'ing-milk',
        name_en: 'Milk',
        name_hi: 'दूध',
        category: 'dairy',
        is_selected: true,
        quantity: 10,
        unit: 'litre',
        rate: 60,
        rate_unit: 'litre',
        calculated_cost: 600,
      },
    ];

    const overheads: AdditionalOverheads = {
      electricity: 0,
      generator_fuel: 0,
      gas: 0,
      direct_labour: 0,
      water: 0,
      packaging_extra: 0,
      transport: 0,
      other: 0,
    };

    // 100 produced, 0 damaged = 100 saleable -> ₹600 / 100 = ₹6.00 per piece
    const res = calculateProductionCosting(rows, overheads, 100, 0, 10);
    expect(res.saleable_pieces).toBe(100);
    expect(res.cost_per_saleable_kulfi).toBe(6.0);
  });

  it('10. Wastage increases cost per saleable kulfi', () => {
    const rows: CostingIngredientRow[] = [
      {
        ingredient_id: 'ing-milk',
        name_en: 'Milk',
        name_hi: 'दूध',
        category: 'dairy',
        is_selected: true,
        quantity: 10,
        unit: 'litre',
        rate: 60,
        rate_unit: 'litre',
        calculated_cost: 600,
      },
    ];

    const overheads: AdditionalOverheads = {
      electricity: 0,
      generator_fuel: 0,
      gas: 0,
      direct_labour: 0,
      water: 0,
      packaging_extra: 0,
      transport: 0,
      other: 0,
    };

    // 100 produced, 20 damaged = 80 saleable -> ₹600 / 80 = ₹7.50 per piece
    const res = calculateProductionCosting(rows, overheads, 100, 20, 10);
    expect(res.saleable_pieces).toBe(80);
    expect(res.cost_per_saleable_kulfi).toBe(7.5);
    expect(res.cost_per_saleable_kulfi).toBeGreaterThan(6.0);
  });

  it('11. Selling price, profit per kulfi, and gross margin % calculation', () => {
    const rows: CostingIngredientRow[] = [
      {
        ingredient_id: 'ing-milk',
        name_en: 'Milk',
        name_hi: 'दूध',
        category: 'dairy',
        is_selected: true,
        quantity: 10,
        unit: 'litre',
        rate: 60,
        rate_unit: 'litre',
        calculated_cost: 600,
      },
    ];

    const overheads: AdditionalOverheads = {
      electricity: 0,
      generator_fuel: 0,
      gas: 0,
      direct_labour: 0,
      water: 0,
      packaging_extra: 0,
      transport: 0,
      other: 0,
    };

    // Total cost = 600, 100 pieces sold @ ₹10 each
    // Expected sales = 100 * 10 = ₹1,000
    // Gross profit = 1,000 - 600 = ₹400
    // Gross margin % = (400 / 1000) * 100 = 40%
    // Profit per kulfi = ₹10 - ₹6 = ₹4.00
    const res = calculateProductionCosting(rows, overheads, 100, 0, 10);
    expect(res.selling_price_per_kulfi).toBe(10);
    expect(res.expected_total_sales).toBe(1000);
    expect(res.estimated_total_gross_profit).toBe(400);
    expect(res.gross_margin_percentage).toBe(40);
    expect(res.estimated_profit_per_kulfi).toBe(4.0);
  });

  it('12. Validation throws error if damaged quantity exceeds produced quantity', () => {
    const rows: CostingIngredientRow[] = [];
    const overheads: AdditionalOverheads = {
      electricity: 0,
      generator_fuel: 0,
      gas: 0,
      direct_labour: 0,
      water: 0,
      packaging_extra: 0,
      transport: 0,
      other: 0,
    };

    expect(() => calculateProductionCosting(rows, overheads, 50, 60, 10)).toThrow(
      'खराब मात्रा (Damaged quantity) उत्पादित मात्रा से अधिक नहीं हो सकती'
    );
  });
});

describe('Production Quantity Scaling & Fixed Overheads', () => {
  const dummyRecipe: RecipeWithItems = {
    id: 'rec-test-01',
    product_id: 'prod-sada-01',
    version_number: 1,
    name: 'Standard 100 pcs',
    standard_output_pieces: 100,
    default_overheads: {
      electricity: 30,
      generator_fuel: 0,
      gas: 50,
      direct_labour: 60,
      water: 0,
      packaging_extra: 0,
      transport: 10,
      other: 10,
    },
    is_default: true,
    effective_from: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    items: [
      {
        id: 'it-1',
        recipe_id: 'rec-test-01',
        ingredient_id: 'ing-milk-01',
        quantity: 10,
        unit: 'litre',
        ingredient: {
          id: 'ing-milk-01',
          code: 'ING-MILK',
          name_en: 'Milk',
          name_hi: 'दूध',
          category: 'dairy',
          base_unit: 'litre',
          current_rate: 60,
          rate_unit: 'litre',
          is_active: true,
        },
      },
      {
        id: 'it-2',
        recipe_id: 'rec-test-01',
        ingredient_id: 'ing-sug-02',
        quantity: 1.2,
        unit: 'kg',
        ingredient: {
          id: 'ing-sug-02',
          code: 'ING-SUGAR',
          name_en: 'Sugar',
          name_hi: 'चीनी',
          category: 'sweetener',
          base_unit: 'kg',
          current_rate: 48,
          rate_unit: 'kg',
          is_active: true,
        },
      },
    ],
  };

  it('13. Quantity scaling scales ingredients linearly (e.g. 500 pcs = 5x multiplier)', () => {
    const scaled = scaleProductionRecipe(dummyRecipe, 500);
    expect(scaled.scale_factor).toBe(5);
    expect(scaled.required_batches).toBe(5);

    const milk = scaled.scaled_ingredients.find((i) => i.name_en === 'Milk');
    expect(milk?.quantity).toBe(50); // 10 * 5 = 50 litres
    expect(milk?.estimated_cost).toBe(3000); // 50 * 60 = ₹3,000

    const sugar = scaled.scaled_ingredients.find((i) => i.name_en === 'Sugar');
    expect(sugar?.quantity).toBe(6.0); // 1.2 * 5 = 6.0 kg
    expect(sugar?.estimated_cost).toBe(288); // 6 * 48 = ₹288
  });

  it('14. Fixed batch overhead scaling uses ceiling of required batches (e.g. 250 pcs = 3 batches)', () => {
    const scaled = scaleProductionRecipe(dummyRecipe, 250);
    expect(scaled.scale_factor).toBe(2.5);
    expect(scaled.required_batches).toBe(3); // ceil(250 / 100) = 3 batches

    // Base gas = ₹50 -> 3 batches = ₹150
    expect(scaled.scaled_overheads.gas).toBe(150);
    // Base labour = ₹60 -> 3 batches = ₹180
    expect(scaled.scaled_overheads.direct_labour).toBe(180);
  });
});

describe('MockStore - Recipes & Costing Snapshot Persistence', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('15. Separate independent recipes exist for ₹10, ₹20, and ₹40 products', () => {
    const sadaRecipe = mockStore.getRecipeForProduct('prod-sada-01');
    const rabriRecipe = mockStore.getRecipeForProduct('prod-rabri-02');
    const premRecipe = mockStore.getRecipeForProduct('prod-prem-03');

    expect(sadaRecipe).toBeDefined();
    expect(rabriRecipe).toBeDefined();
    expect(premRecipe).toBeDefined();

    expect(sadaRecipe?.product_id).toBe('prod-sada-01');
    expect(rabriRecipe?.product_id).toBe('prod-rabri-02');
    expect(premRecipe?.product_id).toBe('prod-prem-03');

    // Modifying ₹20 recipe does not alter ₹10 recipe
    mockStore.saveRecipe({
      product_id: 'prod-rabri-02',
      standard_output_pieces: 120,
      default_overheads: {
        electricity: 100,
        generator_fuel: 0,
        gas: 150,
        direct_labour: 200,
        water: 0,
        packaging_extra: 0,
        transport: 0,
        other: 0,
      },
      items: [
        { ingredient_id: 'ing-milk-01', quantity: 22, unit: 'litre' },
      ],
    });

    const updatedRabri = mockStore.getRecipeForProduct('prod-rabri-02');
    const unchangedSada = mockStore.getRecipeForProduct('prod-sada-01');

    expect(updatedRabri?.version_number).toBe(2);
    expect(updatedRabri?.standard_output_pieces).toBe(120);
    expect(unchangedSada?.version_number).toBe(1);
    expect(unchangedSada?.standard_output_pieces).toBe(100);
  });

  it('16. Historical rate snapshot persistence: future rate changes do not alter past completed batches', () => {
    // 1. Create a completed batch with milk @ ₹60/litre
    const batch = mockStore.createProductionCostingBatch({
      productionDate: '2026-09-01',
      productId: 'prod-sada-01',
      producedQuantity: 100,
      damagedQuantity: 0,
      totalIngredientCost: 600,
      overheadCosts: {
        electricity: 0,
        generator_fuel: 0,
        gas: 0,
        direct_labour: 0,
        water: 0,
        packaging_extra: 0,
        transport: 0,
        other: 0,
      },
      totalBatchCost: 600,
      costPerPiece: 6.0,
      expectedSales: 1000,
      estimatedGrossProfit: 400,
      grossMarginPercentage: 40,
      ingredients: [
        {
          ingredient_id: 'ing-milk-01',
          ingredient_name: 'Milk',
          quantity_used: 10,
          unit: 'litre',
          converted_base_quantity: 10,
          rate_snapshot: 60.0,
          rate_unit: 'litre',
          calculated_cost: 600.0,
          is_packaging: false,
        },
      ],
    });

    expect(batch.id).toBeDefined();
    expect(batch.total_ingredient_cost).toBe(600);

    // 2. Now change milk rate in Ingredient Master to ₹80/litre
    mockStore.updateIngredientRate('ing-milk-01', 80, 'litre', true);
    const updatedMilk = mockStore.getIngredientById('ing-milk-01');
    expect(updatedMilk?.current_rate).toBe(80);

    // 3. Verify the past batch cost remains unchanged at ₹600 and rate snapshot is still ₹60
    const pastBatches = mockStore.getProductionBatches();
    const pastBatch = pastBatches.find((b) => b.id === batch.id);
    expect(pastBatch?.total_ingredient_cost).toBe(600);

    const snapshot = mockStore
      .getState()
      .production_batch_ingredients?.find((pbi) => pbi.batch_id === batch.id);
    expect(snapshot?.rate_snapshot).toBe(60.0);
    expect(snapshot?.calculated_cost).toBe(600.0);
  });
});
