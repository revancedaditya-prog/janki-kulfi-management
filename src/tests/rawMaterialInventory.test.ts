import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertQuantity,
  calculateWeightedAverageRate,
  calculateLpgRemaining,
  getExpiryStatus,
  allocateFefoLots,
} from '@/lib/inventoryService';
import { mockStore } from '@/lib/mockStore';
import { InventoryLot } from '@/types';

describe('Raw Material Inventory Management Module', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  describe('1. Unit Conversions & Calculations', () => {
    it('accurately converts standard weights and volumes', () => {
      // kg to g
      expect(convertQuantity(2.5, 'kg', 'g')).toBe(2500);
      expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);

      // litre to ml
      expect(convertQuantity(1.8, 'litre', 'ml')).toBe(1800);
      expect(convertQuantity(250, 'ml', 'litre')).toBe(0.25);
    });

    it('accurately converts custom factor units (boxes, packets, bottles)', () => {
      // 1 box = 1000 sticks
      expect(convertQuantity(5, 'box', 'piece', 1000)).toBe(5000);
      expect(convertQuantity(3000, 'piece', 'box', 1000)).toBe(3);

      // 1 packet = 500 wrappers
      expect(convertQuantity(4, 'packet', 'piece', 500)).toBe(2000);

      // 1 bottle = 500 ml flavour
      expect(convertQuantity(2, 'bottle', 'ml', 500)).toBe(1000);

      // 1 cylinder = 19 kg gas
      expect(convertQuantity(2, 'cylinder', 'kg', 19)).toBe(38);
    });

    it('calculates weighted average cost (WAC) correctly', () => {
      // Existing: 10 kg @ ₹50 = ₹500
      // Purchase: 20 kg @ ₹65 = ₹1300
      // Total: 30 kg @ (1800 / 30) = ₹60.00
      const newWac = calculateWeightedAverageRate(10, 50, 20, 65);
      expect(newWac).toBe(60.0);
    });

    it('calculates accurate remaining LPG using tare weight formula', () => {
      // Tare Weight = 15.2 kg, Current Gross = 29.5 kg -> Remaining = 14.3 kg (75.3%)
      const calc = calculateLpgRemaining(29.5, 15.2, 19.0);
      expect(calc.remainingKg).toBe(14.3);
      expect(calc.percentage).toBe(75.3);
      expect(calc.isLow).toBe(false);
      expect(calc.isEmpty).toBe(false);

      // Empty cylinder: Gross = 15.2 kg
      const emptyCalc = calculateLpgRemaining(15.2, 15.2, 19.0);
      expect(emptyCalc.remainingKg).toBe(0);
      expect(emptyCalc.percentage).toBe(0);
      expect(emptyCalc.isEmpty).toBe(true);
    });

    it('evaluates lot expiry status correctly', () => {
      const today = new Date();

      // 5 days remaining
      const future5d = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(getExpiryStatus(future5d).status).toBe('expiring_soon_7d');

      // 20 days remaining
      const future20d = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(getExpiryStatus(future20d).status).toBe('expiring_soon_30d');

      // Expired 2 days ago
      const past2d = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(getExpiryStatus(past2d).status).toBe('expired');
    });

    it('performs First Expire First Out (FEFO) lot allocation', () => {
      const mockLots: InventoryLot[] = [
        {
          id: 'lot-late',
          ingredient_id: 'ing-milk',
          lot_number: 'LOT-B',
          initial_quantity: 50,
          remaining_quantity: 30,
          base_unit: 'litre',
          unit_cost: 60,
          expiry_date: '2026-09-30',
          status: 'active',
        },
        {
          id: 'lot-early',
          ingredient_id: 'ing-milk',
          lot_number: 'LOT-A',
          initial_quantity: 20,
          remaining_quantity: 15,
          base_unit: 'litre',
          unit_cost: 58,
          expiry_date: '2026-09-10', // earlier expiry
          status: 'active',
        },
      ];

      // Need 25 litres: should take 15 from lot-early first, then 10 from lot-late
      const result = allocateFefoLots(mockLots, 25);
      expect(result.unallocatedQuantity).toBe(0);
      expect(result.allocatedLots.length).toBe(2);
      expect(result.allocatedLots[0].lot.id).toBe('lot-early');
      expect(result.allocatedLots[0].quantityAllocated).toBe(15);
      expect(result.allocatedLots[1].lot.id).toBe('lot-late');
      expect(result.allocatedLots[1].quantityAllocated).toBe(10);
    });
  });

  describe('2. Material Purchases & Stock-In Ledger Workflows', () => {
    it('creates a material purchase, increases raw material stock, logs ledger movement, and updates WAC', () => {
      const sugar = mockStore.getIngredients().find((i) => i.code === 'ING-SUGAR')!;
      const initialStock = sugar.available_base_quantity || 0;

      const purchase = mockStore.createMaterialPurchase({
        purchase_date: '2026-09-04',
        supplier_id: 'sup-sugar-02',
        invoice_number: 'INV-SUG-999',
        payment_method: 'upi',
        paid_amount: 2500,
        items: [
          {
            ingredient_id: sugar.id,
            purchased_quantity: 50,
            purchase_unit: 'kg',
            unit_price: 50,
            discount: 0,
            tax: 0,
            allocated_charge: 0,
          },
        ],
      });

      expect(purchase).toBeDefined();
      expect(purchase.total_amount).toBe(2500);

      // Verify stock increased
      const updatedStock = mockStore.getAvailableRawMaterialStock(sugar.id);
      expect(updatedStock).toBe(initialStock + 50);

      // Verify ledger movement
      const movements = mockStore.getRawMaterialMovements(sugar.id);
      const purchaseMv = movements.find(
        (m) => m.reference_id === purchase.id && m.movement_type === 'purchase_received'
      );
      expect(purchaseMv).toBeDefined();
      expect(purchaseMv?.quantity).toBe(50);
    });

    it('reverses material purchase safely and restores ledger balance', () => {
      const cashew = mockStore.getIngredients().find((i) => i.code === 'ING-CASHEW')!;
      const stockBefore = mockStore.getAvailableRawMaterialStock(cashew.id);

      const purchase = mockStore.createMaterialPurchase({
        purchase_date: '2026-09-04',
        payment_method: 'cash',
        paid_amount: 8000,
        items: [
          {
            ingredient_id: cashew.id,
            purchased_quantity: 10,
            purchase_unit: 'kg',
            unit_price: 800,
          },
        ],
      });

      expect(mockStore.getAvailableRawMaterialStock(cashew.id)).toBe(stockBefore + 10);

      // Reverse the purchase
      const reversed = mockStore.reverseMaterialPurchase(purchase.id, 'Wrong bill entered');
      expect(reversed).toBe(true);

      // Verify stock returned to original
      expect(mockStore.getAvailableRawMaterialStock(cashew.id)).toBe(stockBefore);

      // Verify reversal movement logged
      const movements = mockStore.getRawMaterialMovements(cashew.id);
      const revMv = movements.find(
        (m) => m.reference_id === purchase.id && m.movement_type === 'purchase_reversal'
      );
      expect(revMv).toBeDefined();
      expect(revMv?.quantity).toBe(-10);
    });
  });

  describe('3. Physical Stock Audit & Wastage Logging', () => {
    it('creates physical stock count correction ledger movements when approved', () => {
      const khoya = mockStore.getIngredients().find((i) => i.code === 'ING-KHOYA')!;
      const appStock = mockStore.getAvailableRawMaterialStock(khoya.id); // e.g. 15 kg

      // Physical count finds 12 kg (shortage of 3 kg)
      const audit = mockStore.createPhysicalStockCount({
        count_date: '2026-09-04',
        notes: 'Monthly Physical Stocktake',
        status: 'approved',
        items: [
          {
            ingredient_id: khoya.id,
            physical_stock: appStock - 3,
            reason: 'Physical shortage found during cold room count',
          },
        ],
      });

      expect(audit.status).toBe('approved');
      expect(mockStore.getAvailableRawMaterialStock(khoya.id)).toBe(appStock - 3);

      const movements = mockStore.getRawMaterialMovements(khoya.id);
      const correctionMv = movements.find(
        (m) => m.reference_id === audit.id && m.movement_type === 'physical_count_correction'
      );
      expect(correctionMv).toBeDefined();
      expect(correctionMv?.quantity).toBe(-3);
    });

    it('records inventory wastage and deducts stock with loss valuation', () => {
      const milk = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
      const stockBefore = mockStore.getAvailableRawMaterialStock(milk.id);

      const wastage = mockStore.recordInventoryWastage({
        wastage_date: '2026-09-04',
        ingredient_id: milk.id,
        quantity: 2,
        unit: 'litre',
        wastage_type: 'spillage',
        reason: 'Milk boiled over during batch preparation',
      });

      expect(wastage).toBeDefined();
      expect(wastage.total_loss_value).toBe(120); // 2L * ₹60
      expect(mockStore.getAvailableRawMaterialStock(milk.id)).toBe(stockBefore - 2);
    });
  });

  describe('4. Atomic Production Batch Completion with Raw Material Consumption', () => {
    it('atomically deducts consumed raw materials and adds finished kulfi to freezer stock', () => {
      const milk = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
      const sugar = mockStore.getIngredients().find((i) => i.code === 'ING-SUGAR')!;
      const stick = mockStore.getIngredients().find((i) => i.code === 'ING-STICK')!;
      const sadaProduct = mockStore.getProducts().find((p) => p.sku === 'JK-SADA-01' || p.id === 'prod-sada-01')!;

      const milkStockBefore = mockStore.getAvailableRawMaterialStock(milk.id);
      const sugarStockBefore = mockStore.getAvailableRawMaterialStock(sugar.id);
      const stickStockBefore = mockStore.getAvailableRawMaterialStock(stick.id);
      const freezerStockBefore = mockStore.getAvailableFreezerStock(sadaProduct.id);

      // Create draft batch: 100 Sada Kulfi
      const batch = mockStore.createProductionBatch(
        '2026-09-04',
        500,
        'Daily morning batch',
        [
          {
            product_id: sadaProduct.id,
            produced_quantity: 100,
            damaged_quantity: 0,
          },
        ],
        'usr-owner-001'
      );

      // Complete batch with raw materials: 15L Milk, 1.5kg Sugar, 100 Sticks
      const completed = mockStore.completeProductionWithRawMaterials(batch.id, [
        { ingredient_id: milk.id, quantity_used: 15, unit: 'litre' },
        { ingredient_id: sugar.id, quantity_used: 1.5, unit: 'kg' },
        { ingredient_id: stick.id, quantity_used: 100, unit: 'piece' },
      ]);

      expect(completed.status).toBe('completed');

      // Verify raw materials deducted
      expect(mockStore.getAvailableRawMaterialStock(milk.id)).toBe(milkStockBefore - 15);
      expect(mockStore.getAvailableRawMaterialStock(sugar.id)).toBe(sugarStockBefore - 1.5);
      expect(mockStore.getAvailableRawMaterialStock(stick.id)).toBe(stickStockBefore - 100);

      // Verify finished kulfi increased in freezer stock
      expect(mockStore.getAvailableFreezerStock(sadaProduct.id)).toBe(freezerStockBefore + 100);
    });

    it('atomically reverses raw material consumption when a completed batch is deleted', () => {
      const milk = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
      const sadaProduct = mockStore.getProducts().find((p) => p.sku === 'JK-SADA-01' || p.id === 'prod-sada-01')!;

      const milkStockBefore = mockStore.getAvailableRawMaterialStock(milk.id);
      const freezerBefore = mockStore.getAvailableFreezerStock(sadaProduct.id);

      const batch = mockStore.createProductionBatch(
        '2026-09-04',
        500,
        'Batch to delete',
        [{ product_id: sadaProduct.id, produced_quantity: 50, damaged_quantity: 0 }],
        'usr-owner-001'
      );

      mockStore.completeProductionWithRawMaterials(batch.id, [
        { ingredient_id: milk.id, quantity_used: 7.5, unit: 'litre' },
      ]);

      expect(mockStore.getAvailableRawMaterialStock(milk.id)).toBe(milkStockBefore - 7.5);
      expect(mockStore.getAvailableFreezerStock(sadaProduct.id)).toBe(freezerBefore + 50);

      // Delete the batch
      const delResult = mockStore.deleteProductionBatch(batch.id, 'Cancelled test production');
      expect(delResult.success).toBe(true);

      // Verify raw materials restored
      expect(mockStore.getAvailableRawMaterialStock(milk.id)).toBe(milkStockBefore);

      // Verify freezer stock deducted back
      expect(mockStore.getAvailableFreezerStock(sadaProduct.id)).toBe(freezerBefore);
    });
  });
});
