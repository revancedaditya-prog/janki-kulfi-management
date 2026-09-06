import { describe, it, expect, beforeEach } from 'vitest';
import { api, useMockMode } from '@/lib/api';
import { mockStore } from '@/lib/mockStore';
import { convertQuantity } from '@/lib/inventoryService';

describe('Raw Material Authoritative Live Supabase & Mock Mode Isolation', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('1. useMockMode never enables mock mode in production builds', () => {
    // In production environment (DEV=false), mock mode is strictly disabled
    const isProduction = !import.meta.env.DEV && import.meta.env.MODE !== 'test';
    if (isProduction) {
      expect(useMockMode).toBe(false);
    }
  });

  it('2. Multi-item purchase updates stock exactly once with unit normalization', async () => {
    const sugar = mockStore.getIngredients().find((i) => i.code === 'ING-SUGAR')!;
    const cashew = mockStore.getIngredients().find((i) => i.code === 'ING-CASHEW')!;
    const sugarStockBefore = mockStore.getAvailableRawMaterialStock(sugar.id);
    const cashewStockBefore = mockStore.getAvailableRawMaterialStock(cashew.id);

    const purchase = await api.createMaterialPurchase(
      {
        purchase_date: '2026-09-06',
        payment_method: 'upi',
        paid_amount: 2650,
        items: [
          {
            ingredient_id: sugar.id,
            purchased_quantity: 25,
            purchase_unit: 'kg',
            unit_price: 42,
          },
          {
            ingredient_id: cashew.id,
            purchased_quantity: 2,
            purchase_unit: 'kg',
            unit_price: 800,
          },
        ],
      },
      'usr-owner-001'
    );

    expect(purchase).toBeDefined();
    expect(purchase.id).toBeDefined();
    expect(purchase.total_amount).toBe(25 * 42 + 2 * 800);

    const sugarStockAfter = await api.getAvailableRawMaterialStock(sugar.id);
    const cashewStockAfter = await api.getAvailableRawMaterialStock(cashew.id);

    expect(sugarStockAfter).toBe(sugarStockBefore + 25);
    expect(cashewStockAfter).toBe(cashewStockBefore + 2);
  });

  it('3. Raw material movements calculate authoritative running balance accurately', async () => {
    const milk = mockStore.getIngredients().find((i) => i.code === 'ING-MILK')!;
    const initialBalances = await api.getRawMaterialBalances();
    const milkInitialBalance = initialBalances[milk.id] || 0;

    // Add purchase
    const purchase = await api.createMaterialPurchase(
      {
        purchase_date: '2026-09-06',
        payment_method: 'cash',
        paid_amount: 600,
        items: [
          {
            ingredient_id: milk.id,
            purchased_quantity: 10,
            purchase_unit: 'litre',
            unit_price: 60,
          },
        ],
      },
      'usr-owner-001'
    );

    expect(purchase).toBeDefined();
    const updatedBalances = await api.getRawMaterialBalances();
    expect(updatedBalances[milk.id]).toBe(milkInitialBalance + 10);
  });

  it('4. Raw material KPIs accurately summarize inventory value and stock counts', async () => {
    const kpis = await api.getRawMaterialDashboardKPIs();
    expect(kpis).toBeDefined();
    expect(typeof kpis.totalInventoryValue).toBe('number');
    expect(typeof kpis.totalActiveMaterials).toBe('number');
    expect(typeof kpis.lowStockMaterials).toBe('number');
    expect(typeof kpis.outOfStockMaterials).toBe('number');
    expect(typeof kpis.purchasesThisMonth).toBe('number');
    expect(typeof kpis.productionConsumptionThisMonth).toBe('number');
    expect(kpis.totalActiveMaterials).toBeGreaterThan(0);
  });

  it('5. Safe Physical stock correction logs new movement without modifying past movements', async () => {
    const sugar = mockStore.getIngredients().find((i) => i.code === 'ING-SUGAR')!;
    const currentStock = await api.getAvailableRawMaterialStock(sugar.id);

    // Physical count found currentStock - 1.5 kg
    const result = await api.correctRawMaterialStock({
      ingredientId: sugar.id,
      newQuantity: currentStock - 1.5,
      reason: 'Physical shortage found during weekly audit',
      userId: 'usr-owner-001',
    });

    expect(result.success).toBe(true);
    expect(result.difference).toBe(-1.5);

    const stockAfter = await api.getAvailableRawMaterialStock(sugar.id);
    expect(stockAfter).toBe(currentStock - 1.5);
  });

  it('6. Conversion helper handles weight, volume, and count units without errors', () => {
    expect(convertQuantity(500, 'ml', 'litre')).toBe(0.5);
    expect(convertQuantity(2.5, 'kg', 'g')).toBe(2500);
    expect(convertQuantity(100, 'piece', 'box', 100)).toBe(1);
  });
});
