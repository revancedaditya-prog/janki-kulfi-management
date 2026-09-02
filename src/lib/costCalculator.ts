import {
  UnitType,
  CostingIngredientRow,
  AdditionalOverheads,
  CostCalculationBreakdown,
  ProductionScalingResult,
  RecipeWithItems,
} from '@/types';

/**
 * Standard Unit Conversion Table & Functions
 */
export function convertUnitQuantity(
  quantity: number,
  fromUnit: UnitType,
  toUnit: UnitType
): number {
  const qty = Number(quantity) || 0;
  if (qty <= 0) return 0;
  if (fromUnit === toUnit) return qty;

  // Weight conversions
  if (fromUnit === 'kg' && toUnit === 'g') return qty * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return qty / 1000;

  // Volume conversions
  if (fromUnit === 'litre' && toUnit === 'ml') return qty * 1000;
  if (fromUnit === 'ml' && toUnit === 'litre') return qty / 1000;

  // Piece & Pack (1:1 base unit conversion)
  if ((fromUnit === 'piece' && toUnit === 'pack') || (fromUnit === 'pack' && toUnit === 'piece')) {
    return qty;
  }

  // Cross-category fallback
  return qty;
}

/**
 * Calculate single ingredient cost with automatic unit conversion
 * Formula: Converted quantity to rate_unit * rate
 */
export function calculateIngredientRowCost(
  quantity: number,
  unit: UnitType,
  rate: number,
  rateUnit: UnitType
): number {
  const qty = Number(quantity) || 0;
  const unitRate = Number(rate) || 0;
  if (qty <= 0 || unitRate <= 0) return 0;

  let convertedQty = qty;
  if (unit !== rateUnit) {
    if (unit === 'g' && rateUnit === 'kg') {
      convertedQty = qty / 1000;
    } else if (unit === 'kg' && rateUnit === 'g') {
      convertedQty = qty * 1000;
    } else if (unit === 'ml' && rateUnit === 'litre') {
      convertedQty = qty / 1000;
    } else if (unit === 'litre' && rateUnit === 'ml') {
      convertedQty = qty * 1000;
    } else {
      convertedQty = convertUnitQuantity(qty, unit, rateUnit);
    }
  }

  return Number((convertedQty * unitRate).toFixed(2));
}

/**
 * Calculate comprehensive production batch costing and gross profit breakdown
 */
export function calculateProductionCosting(
  ingredients: CostingIngredientRow[],
  overheads: AdditionalOverheads,
  producedQuantity: number,
  damagedQuantity: number,
  sellingPrice: number
): CostCalculationBreakdown {
  const produced = Math.max(0, Math.round(Number(producedQuantity) || 0));
  const damaged = Math.max(0, Math.round(Number(damagedQuantity) || 0));

  if (damaged > produced) {
    throw new Error('खराब मात्रा (Damaged quantity) उत्पादित मात्रा से अधिक नहीं हो सकती');
  }

  const saleable = produced - damaged;
  const price = Math.max(0, Number(sellingPrice) || 0);

  let milk_cost = 0;
  let sugar_cost = 0;
  let khoya_cost = 0;
  let cashew_cost = 0;
  let pistachio_cost = 0;
  let almond_cost = 0;
  let custard_cost = 0;
  let cardamom_cost = 0;
  let saffron_cost = 0;
  let flavour_cost = 0;
  let sticks_cost = 0;
  let wrappers_cost = 0;
  let packing_cost = 0;
  let other_ingredient_cost = 0;
  let total_ingredient_cost = 0;

  const missing_rate_ingredients: string[] = [];

  for (const row of ingredients) {
    if (!row.is_selected) continue;

    const rowCost = calculateIngredientRowCost(row.quantity, row.unit, row.rate, row.rate_unit);
    const codeOrName = (row.ingredient_id + ' ' + row.name_en + ' ' + row.name_hi).toLowerCase();

    if (row.quantity > 0 && (row.rate <= 0 || isNaN(row.rate))) {
      missing_rate_ingredients.push(row.name_hi || row.name_en);
    }

    if (codeOrName.includes('milk') || codeOrName.includes('दूध')) {
      milk_cost += rowCost;
    } else if (codeOrName.includes('sugar') || codeOrName.includes('चीनी')) {
      sugar_cost += rowCost;
    } else if (codeOrName.includes('khoya') || codeOrName.includes('खोया') || codeOrName.includes('मावा')) {
      khoya_cost += rowCost;
    } else if (codeOrName.includes('cashew') || codeOrName.includes('काजू')) {
      cashew_cost += rowCost;
    } else if (codeOrName.includes('pista') || codeOrName.includes('पिस्ता')) {
      pistachio_cost += rowCost;
    } else if (codeOrName.includes('almond') || codeOrName.includes('बादाम')) {
      almond_cost += rowCost;
    } else if (codeOrName.includes('custard') || codeOrName.includes('कस्टर्ड')) {
      custard_cost += rowCost;
    } else if (codeOrName.includes('cardamom') || codeOrName.includes('इलायची')) {
      cardamom_cost += rowCost;
    } else if (codeOrName.includes('saffron') || codeOrName.includes('केसर')) {
      saffron_cost += rowCost;
    } else if (codeOrName.includes('flavour') || codeOrName.includes('फ्लेवर') || codeOrName.includes('essence')) {
      flavour_cost += rowCost;
    } else if (codeOrName.includes('stick') || codeOrName.includes('तीली') || codeOrName.includes('स्टिक')) {
      sticks_cost += rowCost;
    } else if (codeOrName.includes('wrapper') || codeOrName.includes('रैपर')) {
      wrappers_cost += rowCost;
    } else if (codeOrName.includes('pouch') || codeOrName.includes('packing') || codeOrName.includes('पैकिंग')) {
      packing_cost += rowCost;
    } else {
      other_ingredient_cost += rowCost;
    }

    total_ingredient_cost += rowCost;
  }

  // Format ingredient subtotals
  milk_cost = Number(milk_cost.toFixed(2));
  sugar_cost = Number(sugar_cost.toFixed(2));
  khoya_cost = Number(khoya_cost.toFixed(2));
  cashew_cost = Number(cashew_cost.toFixed(2));
  pistachio_cost = Number(pistachio_cost.toFixed(2));
  almond_cost = Number(almond_cost.toFixed(2));
  custard_cost = Number(custard_cost.toFixed(2));
  cardamom_cost = Number(cardamom_cost.toFixed(2));
  saffron_cost = Number(saffron_cost.toFixed(2));
  flavour_cost = Number(flavour_cost.toFixed(2));
  sticks_cost = Number(sticks_cost.toFixed(2));
  wrappers_cost = Number(wrappers_cost.toFixed(2));
  packing_cost = Number(packing_cost.toFixed(2));
  other_ingredient_cost = Number(other_ingredient_cost.toFixed(2));
  total_ingredient_cost = Number(total_ingredient_cost.toFixed(2));

  // Overheads breakdown
  const electricity = Math.max(0, Number(overheads.electricity) || 0);
  const generator_fuel = Math.max(0, Number(overheads.generator_fuel) || 0);
  const gas = Math.max(0, Number(overheads.gas) || 0);
  const direct_labour = Math.max(0, Number(overheads.direct_labour) || 0);
  const water = Math.max(0, Number(overheads.water) || 0);
  const packaging_extra = Math.max(0, Number(overheads.packaging_extra) || 0);
  const transport = Math.max(0, Number(overheads.transport) || 0);
  const other = Math.max(0, Number(overheads.other) || 0);

  const electricity_fuel_cost = Number((electricity + generator_fuel + gas).toFixed(2));
  const labour_cost = Number(direct_labour.toFixed(2));
  const other_overheads_cost = Number((water + transport + other + packaging_extra).toFixed(2));
  const total_overheads_cost = Number(
    (electricity_fuel_cost + labour_cost + other_overheads_cost).toFixed(2)
  );

  // Total packaging cost = sticks + wrappers + packing from recipe ingredients + additional packaging expense
  const total_packaging_cost = Number(
    (sticks_cost + wrappers_cost + packing_cost + packaging_extra).toFixed(2)
  );

  // Total production batch cost = total ingredient costs + overheads
  const total_batch_cost = Number((total_ingredient_cost + total_overheads_cost).toFixed(2));

  // Per kulfi metrics
  let cost_per_saleable_kulfi = 0;
  let estimated_profit_per_kulfi = 0;
  let expected_total_sales = 0;
  let estimated_total_gross_profit = 0;
  let gross_margin_percentage = 0;

  if (saleable > 0) {
    cost_per_saleable_kulfi = Number((total_batch_cost / saleable).toFixed(2));
    estimated_profit_per_kulfi = Number((price - cost_per_saleable_kulfi).toFixed(2));
    expected_total_sales = Number((saleable * price).toFixed(2));
    estimated_total_gross_profit = Number((expected_total_sales - total_batch_cost).toFixed(2));

    if (expected_total_sales > 0) {
      gross_margin_percentage = Number(
        ((estimated_total_gross_profit / expected_total_sales) * 100).toFixed(2)
      );
    }
  }

  return {
    milk_cost,
    sugar_cost,
    khoya_cost,
    cashew_cost,
    pistachio_cost,
    almond_cost,
    custard_cost,
    cardamom_cost,
    saffron_cost,
    flavour_cost,
    sticks_cost,
    wrappers_cost,
    packing_cost,
    other_ingredient_cost,
    total_ingredient_cost,
    total_packaging_cost,
    electricity_fuel_cost,
    labour_cost,
    other_overheads_cost,
    total_overheads_cost,
    total_batch_cost,
    actual_pieces_produced: produced,
    damaged_pieces: damaged,
    saleable_pieces: saleable,
    cost_per_saleable_kulfi,
    selling_price_per_kulfi: price,
    estimated_profit_per_kulfi,
    expected_total_sales,
    estimated_total_gross_profit,
    gross_margin_percentage,
    missing_rate_ingredients,
  };
}

/**
 * Production quantity scaling formula
 * Scale factor = required quantity ÷ standard saleable output
 * Required batches = ceiling(required quantity ÷ standard batch output)
 */
export function scaleProductionRecipe(
  recipe: RecipeWithItems,
  requiredQuantity: number
): ProductionScalingResult {
  const reqQty = Math.max(0, Math.round(Number(requiredQuantity) || 0));
  const stdOutput = Math.max(1, Math.round(Number(recipe.standard_output_pieces) || 100));

  if (reqQty <= 0) {
    return {
      required_quantity: 0,
      standard_output: stdOutput,
      scale_factor: 0,
      required_batches: 0,
      scaled_ingredients: [],
      scaled_overheads: {
        electricity: 0,
        generator_fuel: 0,
        gas: 0,
        direct_labour: 0,
        water: 0,
        packaging_extra: 0,
        transport: 0,
        other: 0,
      },
      estimated_total_cost: 0,
      estimated_cost_per_piece: 0,
    };
  }

  const scale_factor = Number((reqQty / stdOutput).toFixed(4));
  const required_batches = Math.ceil(reqQty / stdOutput);

  let total_ingredient_cost = 0;

  const scaled_ingredients = (recipe.items || []).map((it) => {
    const ingNameEn = it.ingredient?.name_en || 'Ingredient';
    const ingNameHi = it.ingredient?.name_hi || 'सामग्री';
    const stdQty = Number(it.quantity) || 0;
    const scaledQty = Number((stdQty * scale_factor).toFixed(3));
    const rate = Number(it.ingredient?.current_rate) || 0;
    const rateUnit = it.ingredient?.rate_unit || it.unit;

    const estCost = calculateIngredientRowCost(scaledQty, it.unit, rate, rateUnit);
    total_ingredient_cost += estCost;

    return {
      name_en: ingNameEn,
      name_hi: ingNameHi,
      quantity: scaledQty,
      unit: it.unit,
      estimated_cost: estCost,
    };
  });

  // Fixed overheads scaled discretely by number of required batches
  const baseOverheads = recipe.default_overheads || {
    electricity: 0,
    generator_fuel: 0,
    gas: 0,
    direct_labour: 0,
    water: 0,
    packaging_extra: 0,
    transport: 0,
    other: 0,
  };

  const scaled_overheads: AdditionalOverheads = {
    electricity: Number((baseOverheads.electricity * required_batches).toFixed(2)),
    generator_fuel: Number((baseOverheads.generator_fuel * required_batches).toFixed(2)),
    gas: Number((baseOverheads.gas * required_batches).toFixed(2)),
    direct_labour: Number((baseOverheads.direct_labour * required_batches).toFixed(2)),
    water: Number((baseOverheads.water * required_batches).toFixed(2)),
    packaging_extra: Number((baseOverheads.packaging_extra * required_batches).toFixed(2)),
    transport: Number((baseOverheads.transport * required_batches).toFixed(2)),
    other: Number((baseOverheads.other * required_batches).toFixed(2)),
  };

  const total_overheads = Object.values(scaled_overheads).reduce((sum, val) => sum + val, 0);
  const estimated_total_cost = Number((total_ingredient_cost + total_overheads).toFixed(2));
  const estimated_cost_per_piece = Number((estimated_total_cost / reqQty).toFixed(2));

  return {
    required_quantity: reqQty,
    standard_output: stdOutput,
    scale_factor,
    required_batches,
    scaled_ingredients,
    scaled_overheads,
    estimated_total_cost,
    estimated_cost_per_piece,
  };
}
