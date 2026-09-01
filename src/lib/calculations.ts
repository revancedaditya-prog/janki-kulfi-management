import { CommissionType } from '@/types';

export interface SettlementItemInput {
  issued_quantity: number;
  returned_quantity: number;
  damaged_quantity: number;
  complimentary_quantity: number;
  unit_selling_price: number;
  commission_type: CommissionType;
  commission_value: number;
  damage_reason?: string;
  complimentary_reason?: string;
}

export interface SettlementItemCalculationResult {
  issued_quantity: number;
  returned_quantity: number;
  damaged_quantity: number;
  complimentary_quantity: number;
  sold_quantity: number;
  unit_selling_price: number;
  gross_sales: number;
  commission_amount: number;
  net_collection: number;
}

export interface SettlementSummaryCalculationResult {
  total_issued: number;
  total_returned: number;
  total_damaged: number;
  total_complimentary: number;
  total_sold: number;
  gross_sales: number;
  total_commission: number;
  expected_collection: number;
  cash_received: number;
  upi_received: number;
  total_received: number;
  credit_amount: number;
  accounted_amount: number;
  collection_difference: number;
  shortage_amount: number;
  outstanding_amount: number;
}

/**
 * Calculate Saleable production = Produced quantity - Production damage
 */
export function calculateSaleableProduction(produced: number, damaged: number): number {
  const p = Math.max(0, Math.round(Number(produced) || 0));
  const d = Math.max(0, Math.round(Number(damaged) || 0));
  if (d > p) {
    throw new Error('Damaged quantity cannot exceed produced quantity');
  }
  return p - d;
}

/**
 * Calculate Unit Production Cost
 */
export function calculateUnitProductionCost(totalCost: number, saleableQuantity: number): number {
  if (saleableQuantity <= 0 || totalCost <= 0) return 0;
  return Number((totalCost / saleableQuantity).toFixed(2));
}

/**
 * Calculate Sold quantity = Issued - Returned - Damaged - Complimentary
 */
export function calculateSoldQuantity(
  issued: number,
  returned: number,
  damaged: number,
  complimentary: number
): number {
  const i = Math.max(0, Math.round(Number(issued) || 0));
  const r = Math.max(0, Math.round(Number(returned) || 0));
  const d = Math.max(0, Math.round(Number(damaged) || 0));
  const c = Math.max(0, Math.round(Number(complimentary) || 0));

  const totalDeductions = r + d + c;
  if (totalDeductions > i) {
    throw new Error('Total of returned, damaged, and complimentary quantities cannot exceed issued quantity');
  }
  return i - totalDeductions;
}

/**
 * Calculate Commission for an item
 */
export function calculateItemCommission(
  soldQuantity: number,
  grossSales: number,
  type: CommissionType,
  value: number
): number {
  if (soldQuantity <= 0 || value <= 0) return 0;

  if (type === 'percentage') {
    return Number(((grossSales * value) / 100).toFixed(2));
  }
  // Fixed commission per piece
  return Number((soldQuantity * value).toFixed(2));
}

/**
 * Calculate single item settlement values
 */
export function calculateSettlementItem(item: SettlementItemInput): SettlementItemCalculationResult {
  const sold_quantity = calculateSoldQuantity(
    item.issued_quantity,
    item.returned_quantity,
    item.damaged_quantity,
    item.complimentary_quantity
  );

  const unit_price = Number(item.unit_selling_price) || 0;
  const gross_sales = Number((sold_quantity * unit_price).toFixed(2));
  const commission_amount = calculateItemCommission(
    sold_quantity,
    gross_sales,
    item.commission_type,
    item.commission_value
  );
  const net_collection = Number((gross_sales - commission_amount).toFixed(2));

  return {
    issued_quantity: item.issued_quantity,
    returned_quantity: item.returned_quantity,
    damaged_quantity: item.damaged_quantity,
    complimentary_quantity: item.complimentary_quantity,
    sold_quantity,
    unit_selling_price: unit_price,
    gross_sales,
    commission_amount,
    net_collection,
  };
}

/**
 * Calculate full settlement summary (Reconciles Cash, UPI, Credit, Expected Collection, Shortages)
 */
export function calculateSettlementSummary(
  items: SettlementItemInput[],
  cashReceived: number,
  upiReceived: number,
  creditAmount: number
): SettlementSummaryCalculationResult {
  let total_issued = 0;
  let total_returned = 0;
  let total_damaged = 0;
  let total_complimentary = 0;
  let total_sold = 0;
  let gross_sales = 0;
  let total_commission = 0;

  for (const it of items) {
    const res = calculateSettlementItem(it);
    total_issued += res.issued_quantity;
    total_returned += res.returned_quantity;
    total_damaged += res.damaged_quantity;
    total_complimentary += res.complimentary_quantity;
    total_sold += res.sold_quantity;
    gross_sales += res.gross_sales;
    total_commission += res.commission_amount;
  }

  gross_sales = Number(gross_sales.toFixed(2));
  total_commission = Number(total_commission.toFixed(2));
  const expected_collection = Math.max(0, Number((gross_sales - total_commission).toFixed(2)));

  const cash = Math.max(0, Number(cashReceived) || 0);
  const upi = Math.max(0, Number(upiReceived) || 0);
  const credit = Math.max(0, Number(creditAmount) || 0);

  const total_received = Number((cash + upi).toFixed(2));
  const accounted_amount = Number((total_received + credit).toFixed(2));
  const collection_difference = Number((accounted_amount - expected_collection).toFixed(2));

  // If accounted amount is less than expected collection, there is a shortage
  const shortage_amount = collection_difference < 0 ? Math.abs(collection_difference) : 0;
  // Outstanding is credit given plus any shortage
  const outstanding_amount = Number((credit + shortage_amount).toFixed(2));

  return {
    total_issued,
    total_returned,
    total_damaged,
    total_complimentary,
    total_sold,
    gross_sales,
    total_commission,
    expected_collection,
    cash_received: cash,
    upi_received: upi,
    total_received,
    credit_amount: credit,
    accounted_amount,
    collection_difference,
    shortage_amount,
    outstanding_amount,
  };
}

/**
 * Calculate Estimated Daily Profit
 * Formula: Gross sales - seller commissions - allocated production ingredient costs - other operating expenses
 */
export function calculateEstimatedDailyProfit(
  grossSales: number,
  sellerCommissions: number,
  ingredientCosts: number,
  otherExpenses: number
): number {
  const gs = Number(grossSales) || 0;
  const comm = Number(sellerCommissions) || 0;
  const ing = Number(ingredientCosts) || 0;
  const exp = Number(otherExpenses) || 0;

  return Number((gs - comm - ing - exp).toFixed(2));
}
