import { UnitType, InventoryLot } from '@/types';

/**
 * Universal Unit Conversion Helper with Custom Conversion Factors
 */
export function convertQuantity(
  quantity: number,
  fromUnit: UnitType,
  toUnit: UnitType,
  conversionFactor: number = 1
): number {
  const qty = Number(quantity) || 0;
  if (qty <= 0) return 0;
  if (fromUnit === toUnit) return qty;

  // Weight standard conversions
  if (fromUnit === 'kg' && toUnit === 'g') return qty * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return qty / 1000;

  // Volume standard conversions
  if (fromUnit === 'litre' && toUnit === 'ml') return qty * 1000;
  if (fromUnit === 'ml' && toUnit === 'litre') return qty / 1000;

  // Packet to gram or ml
  if ((fromUnit === 'packet' || fromUnit === 'pack') && (toUnit === 'g' || toUnit === 'ml' || toUnit === 'piece')) {
    return qty * (conversionFactor > 0 ? conversionFactor : 1);
  }
  if ((toUnit === 'packet' || toUnit === 'pack') && (fromUnit === 'g' || fromUnit === 'ml' || fromUnit === 'piece')) {
    return conversionFactor > 0 ? qty / conversionFactor : qty;
  }

  // Box to piece
  if (fromUnit === 'box' && toUnit === 'piece') {
    return qty * (conversionFactor > 0 ? conversionFactor : 1);
  }
  if (toUnit === 'box' && fromUnit === 'piece') {
    return conversionFactor > 0 ? qty / conversionFactor : qty;
  }

  // Bottle to ml
  if (fromUnit === 'bottle' && toUnit === 'ml') {
    return qty * (conversionFactor > 0 ? conversionFactor : 1);
  }
  if (toUnit === 'bottle' && fromUnit === 'ml') {
    return conversionFactor > 0 ? qty / conversionFactor : qty;
  }

  // Cylinder to kg
  if (fromUnit === 'cylinder' && toUnit === 'kg') {
    return qty * (conversionFactor > 0 ? conversionFactor : 19);
  }
  if (toUnit === 'cylinder' && fromUnit === 'kg') {
    const cap = conversionFactor > 0 ? conversionFactor : 19;
    return qty / cap;
  }

  // Generic custom conversion factor fallback
  if (conversionFactor > 0) {
    return qty * conversionFactor;
  }

  return qty;
}

/**
 * Format quantity with its base unit and friendly alternative display
 * e.g., 2500 g -> "2.5 kg (2,500 g)"
 */
export function formatIngredientQuantityWithUnit(
  quantity: number,
  baseUnit: UnitType
): string {
  const qty = Number(quantity) || 0;
  if (baseUnit === 'g' && qty >= 1000) {
    return `${(qty / 1000).toFixed(2).replace(/\.00$/, '')} kg (${qty.toLocaleString()} g)`;
  }
  if (baseUnit === 'ml' && qty >= 1000) {
    return `${(qty / 1000).toFixed(2).replace(/\.00$/, '')} L (${qty.toLocaleString()} ml)`;
  }
  return `${qty.toLocaleString()} ${baseUnit}`;
}

/**
 * Weighted Average Cost (WAC) Calculator
 * Formula: (Old Stock Value + New Purchase Value) / (Old Stock Quantity + New Received Quantity)
 */
export function calculateWeightedAverageRate(
  currentStockQty: number,
  currentWeightedRate: number,
  receivedQty: number,
  unitAcquisitionRate: number
): number {
  const currQty = Math.max(0, Number(currentStockQty) || 0);
  const currRate = Math.max(0, Number(currentWeightedRate) || 0);
  const recQty = Math.max(0, Number(receivedQty) || 0);
  const acqRate = Math.max(0, Number(unitAcquisitionRate) || 0);

  const totalQty = currQty + recQty;
  if (totalQty <= 0) return acqRate;

  const totalValue = (currQty * currRate) + (recQty * acqRate);
  return Number((totalValue / totalQty).toFixed(2));
}

/**
 * Accurate LPG Cylinder Remaining Gas & Percentage
 * Formula:
 * Remaining LPG (kg) = Current Gross Weight - Tare Weight (TW)
 * Remaining % = (Remaining LPG / Rated Capacity) * 100
 */
export function calculateLpgRemaining(
  grossWeight: number,
  tareWeight: number,
  ratedCapacity: number = 19.0
): { remainingKg: number; percentage: number; isLow: boolean; isEmpty: boolean } {
  const gross = Math.max(0, Number(grossWeight) || 0);
  const tare = Math.max(0, Number(tareWeight) || 0);
  const rated = Math.max(0.1, Number(ratedCapacity) || 19.0);

  const rawRemaining = gross - tare;
  const remainingKg = Number(Math.min(rated, Math.max(0, rawRemaining)).toFixed(2));
  const percentage = Number(Math.min(100, Math.max(0, (remainingKg / rated) * 100)).toFixed(1));

  return {
    remainingKg,
    percentage,
    isLow: percentage > 0 && percentage <= 20,
    isEmpty: remainingKg <= 0.2, // practically empty
  };
}

/**
 * Expiry Evaluation for Lots and Ingredients
 */
export function getExpiryStatus(expiryDateStr?: string | null): {
  status: 'ok' | 'expiring_soon_30d' | 'expiring_soon_7d' | 'expired';
  daysRemaining: number | null;
  labelEn: string;
  labelHi: string;
} {
  if (!expiryDateStr) {
    return { status: 'ok', daysRemaining: null, labelEn: 'No Expiry', labelHi: 'एक्सपायरी नहीं' };
  }

  const expiry = new Date(expiryDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return { status: 'expired', daysRemaining, labelEn: 'Expired', labelHi: 'एक्सपायर हो चुका है' };
  }
  if (daysRemaining <= 7) {
    return { status: 'expiring_soon_7d', daysRemaining, labelEn: `Expires in ${daysRemaining} days`, labelHi: `${daysRemaining} दिन में एक्सपायर` };
  }
  if (daysRemaining <= 30) {
    return { status: 'expiring_soon_30d', daysRemaining, labelEn: `Expires in ${daysRemaining} days`, labelHi: `${daysRemaining} दिन में एक्सपायर` };
  }

  return { status: 'ok', daysRemaining, labelEn: 'Good', labelHi: 'सुरक्षित' };
}

/**
 * FEFO (First Expire, First Out) Lot Allocation
 * Allocates requirement across active lots sorted by earliest expiry date.
 */
export function allocateFefoLots(
  lots: InventoryLot[],
  requiredQuantity: number
): {
  allocatedLots: { lot: InventoryLot; quantityAllocated: number }[];
  unallocatedQuantity: number;
} {
  let remainingNeeded = Math.max(0, Number(requiredQuantity) || 0);
  const allocatedLots: { lot: InventoryLot; quantityAllocated: number }[] = [];

  // Sort lots by expiry date (nulls/non-expiring last), then by created date
  const sortedLots = [...lots]
    .filter((l) => l.remaining_quantity > 0 && l.status === 'active')
    .sort((a, b) => {
      if (a.expiry_date && b.expiry_date) {
        return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
      }
      if (a.expiry_date) return -1;
      if (b.expiry_date) return 1;
      return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
    });

  for (const lot of sortedLots) {
    if (remainingNeeded <= 0) break;
    const canTake = Math.min(lot.remaining_quantity, remainingNeeded);
    allocatedLots.push({
      lot,
      quantityAllocated: canTake,
    });
    remainingNeeded -= canTake;
  }

  return {
    allocatedLots,
    unallocatedQuantity: remainingNeeded,
  };
}
