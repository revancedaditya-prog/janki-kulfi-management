import { describe, it, expect } from 'vitest';
import {
  calculateSaleableProduction,
  calculateSoldQuantity,
  calculateItemCommission,
  calculateSettlementItem,
  calculateSettlementSummary,
  calculateEstimatedDailyProfit,
  calculateUnitProductionCost,
} from '@/lib/calculations';

describe('Janki Kulfi Core Business Calculations', () => {
  describe('1. Production Calculations', () => {
    it('should calculate saleable production = produced - damaged', () => {
      expect(calculateSaleableProduction(100, 5)).toBe(95);
      expect(calculateSaleableProduction(50, 0)).toBe(50);
      expect(calculateSaleableProduction(200, 200)).toBe(0);
    });

    it('should throw error if damaged > produced', () => {
      expect(() => calculateSaleableProduction(50, 60)).toThrow(
        'Damaged quantity cannot exceed produced quantity'
      );
    });

    it('should calculate unit production cost correctly', () => {
      expect(calculateUnitProductionCost(500, 100)).toBe(5);
      expect(calculateUnitProductionCost(750, 95)).toBe(7.89);
      expect(calculateUnitProductionCost(0, 50)).toBe(0);
    });
  });

  describe('2. Settlement Item Calculations', () => {
    it('should calculate sold quantity = issued - returned - damaged - complimentary', () => {
      // 50 issued, 5 returned, 2 damaged, 1 complimentary = 42 sold
      expect(calculateSoldQuantity(50, 5, 2, 1)).toBe(42);
      expect(calculateSoldQuantity(100, 0, 0, 0)).toBe(100);
      expect(calculateSoldQuantity(30, 20, 5, 5)).toBe(0);
    });

    it('should throw error if return + damage + complimentary > issued', () => {
      expect(() => calculateSoldQuantity(20, 15, 5, 5)).toThrow(
        'cannot exceed issued quantity'
      );
    });

    it('should calculate fixed commission per piece', () => {
      // 40 pieces sold @ ₹2 fixed commission = ₹80
      expect(calculateItemCommission(40, 400, 'fixed', 2)).toBe(80);
      // 25 pieces sold @ ₹4 fixed commission = ₹100
      expect(calculateItemCommission(25, 500, 'fixed', 4)).toBe(100);
    });

    it('should calculate percentage commission', () => {
      // ₹1000 gross sales @ 10% = ₹100
      expect(calculateItemCommission(50, 1000, 'percentage', 10)).toBe(100);
      // ₹750 gross sales @ 12.5% = ₹93.75
      expect(calculateItemCommission(25, 750, 'percentage', 12.5)).toBe(93.75);
    });

    it('should compute full settlement item details', () => {
      const result = calculateSettlementItem({
        issued_quantity: 50,
        returned_quantity: 5,
        damaged_quantity: 2,
        complimentary_quantity: 1,
        unit_selling_price: 10,
        commission_type: 'fixed',
        commission_value: 2,
      });

      expect(result.sold_quantity).toBe(42);
      expect(result.gross_sales).toBe(420);
      expect(result.commission_amount).toBe(84); // 42 * 2
      expect(result.net_collection).toBe(336); // 420 - 84
    });
  });

  describe('3. Multi-Product Settlement Summary & Cash/UPI/Credit Reconciliation', () => {
    it('should reconcile multi-product sales, collections, and shortages accurately', () => {
      const items = [
        {
          issued_quantity: 50,
          returned_quantity: 5,
          damaged_quantity: 1,
          complimentary_quantity: 0,
          unit_selling_price: 10, // Sada Kulfi
          commission_type: 'fixed' as const,
          commission_value: 2,
        },
        {
          issued_quantity: 30,
          returned_quantity: 3,
          damaged_quantity: 0,
          complimentary_quantity: 1,
          unit_selling_price: 20, // Rabri Kulfi
          commission_type: 'fixed' as const,
          commission_value: 4,
        },
        {
          issued_quantity: 20,
          returned_quantity: 0,
          damaged_quantity: 0,
          complimentary_quantity: 0,
          unit_selling_price: 40, // Premium Kulfi
          commission_type: 'fixed' as const,
          commission_value: 8,
        },
      ];

      // Item 1: Sold = 50 - 6 = 44. Gross = 44 * 10 = ₹440. Comm = 44 * 2 = ₹88.
      // Item 2: Sold = 30 - 4 = 26. Gross = 26 * 20 = ₹520. Comm = 26 * 4 = ₹104.
      // Item 3: Sold = 20 - 0 = 20. Gross = 20 * 40 = ₹800. Comm = 20 * 8 = ₹160.
      // Total Sold = 90 pieces. Gross = ₹1760. Total Comm = ₹352.
      // Expected Collection = 1760 - 352 = ₹1408.

      // Case A: Full collection (Cash ₹1000 + UPI ₹408)
      const exactSummary = calculateSettlementSummary(items, 1000, 408, 0);
      expect(exactSummary.total_sold).toBe(90);
      expect(exactSummary.gross_sales).toBe(1760);
      expect(exactSummary.total_commission).toBe(352);
      expect(exactSummary.expected_collection).toBe(1408);
      expect(exactSummary.total_received).toBe(1408);
      expect(exactSummary.collection_difference).toBe(0);
      expect(exactSummary.shortage_amount).toBe(0);
      expect(exactSummary.outstanding_amount).toBe(0);

      // Case B: Collection with Shortage (Cash ₹800 + UPI ₹400 = ₹1200 received vs ₹1408 expected)
      const shortageSummary = calculateSettlementSummary(items, 800, 400, 0);
      expect(shortageSummary.total_received).toBe(1200);
      expect(shortageSummary.collection_difference).toBe(-208);
      expect(shortageSummary.shortage_amount).toBe(208);
      expect(shortageSummary.outstanding_amount).toBe(208);

      // Case C: Collection with Approved Credit (Cash ₹1000 + UPI ₹208 + Credit ₹200)
      const creditSummary = calculateSettlementSummary(items, 1000, 208, 200);
      expect(creditSummary.total_received).toBe(1208);
      expect(creditSummary.accounted_amount).toBe(1408);
      expect(creditSummary.collection_difference).toBe(0);
      expect(creditSummary.shortage_amount).toBe(0);
      expect(creditSummary.outstanding_amount).toBe(200); // The credit given
    });
  });

  describe('4. Estimated Daily Profit Formula', () => {
    it('should compute profit = gross_sales - commissions - ingredient_costs - operating_expenses', () => {
      // Gross sales ₹2000, Commission ₹400, Ingredients ₹600, Electricity & Fuel ₹300
      // Estimated Profit = 2000 - 400 - 600 - 300 = ₹700
      expect(calculateEstimatedDailyProfit(2000, 400, 600, 300)).toBe(700);

      // Zero sales with ongoing expenses
      expect(calculateEstimatedDailyProfit(0, 0, 0, 250)).toBe(-250);
    });
  });
});
