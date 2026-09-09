import { describe, it, expect, beforeEach } from 'vitest';
import { api, getIndiaMonthBounds } from '@/lib/api';
import { mockStore } from '@/lib/mockStore';
import { convertQuantity, formatIngredientQuantityWithUnit } from '@/lib/inventoryService';

describe('BADAM Purchase → Inventory Stock Authoritative Update & Atomic Reconciliation', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  // 1. Receiving 10 kg BADAM changes balance from 5 to 15 kg (or increases by exactly 10 kg)
  it('1. Receiving 10 kg BADAM updates available stock by +10 kg', async () => {
    const badam = mockStore.getIngredients().find((i) => i.code === 'ING-ALMOND' || i.name_hi.includes('बादाम'))!;
    const initialStock = mockStore.getAvailableRawMaterialStock(badam.id);

    const purchase = await api.createMaterialPurchase(
      {
        purchase_date: '2026-09-09',
        payment_method: 'bank_transfer',
        paid_amount: 32000,
        items: [
          {
            ingredient_id: badam.id,
            purchased_quantity: 10,
            purchase_unit: 'kg',
            unit_price: 3200,
          },
        ],
      },
      'usr-owner-001'
    );

    expect(purchase).toBeDefined();
    expect(purchase.items.length).toBe(1);
    expect(purchase.total_amount).toBe(32000);

    const updatedStock = await api.getAvailableRawMaterialStock(badam.id);
    expect(updatedStock).toBe(initialStock + 10);
  });

  // 2. ₹3,200 × 10 kg gives ₹32,000 purchase value
  it('2. ₹3,200 rate × 10 kg quantity calculates ₹32,000 total purchase value', async () => {
    const badam = mockStore.getIngredients().find((i) => i.code === 'ING-ALMOND' || i.name_hi.includes('बादाम'))!;

    const purchase = await api.createMaterialPurchase(
      {
        purchase_date: '2026-09-09',
        payment_method: 'upi',
        paid_amount: 32000,
        items: [
          {
            ingredient_id: badam.id,
            purchased_quantity: 10,
            purchase_unit: 'kg',
            unit_price: 3200,
            discount: 0,
            tax: 0,
          },
        ],
      },
      'usr-owner-001'
    );

    expect(purchase.total_amount).toBe(32000);
    expect(purchase.items[0].net_item_cost).toBe(32000);
    expect(purchase.items[0].unit_acquisition_cost).toBe(3200);
  });

  // 3. Monthly purchases increase by ₹32,000 in Asia/Kolkata timezone
  it('3. Monthly purchases KPI increases by ₹32,000 using Asia/Kolkata month bounds', async () => {
    const badam = mockStore.getIngredients().find((i) => i.code === 'ING-ALMOND' || i.name_hi.includes('बादाम'))!;

    const kpiBefore = await api.getRawMaterialDashboardKPIs();
    const purchaseValBefore = Number(kpiBefore?.purchasesThisMonth || 0);

    await api.createMaterialPurchase(
      {
        purchase_date: '2026-09-09',
        payment_method: 'cash',
        paid_amount: 32000,
        items: [
          {
            ingredient_id: badam.id,
            purchased_quantity: 10,
            purchase_unit: 'kg',
            unit_price: 3200,
          },
        ],
      },
      'usr-owner-001'
    );

    const kpiAfter = await api.getRawMaterialDashboardKPIs();
    expect(kpiAfter.purchasesThisMonth).toBe(purchaseValBefore + 32000);
  });

  // 4. Running the same idempotency key twice does not duplicate purchase or stock
  it('4. Submitting with the same idempotency key prevents duplicate purchase and stock creation', async () => {
    const badam = mockStore.getIngredients().find((i) => i.code === 'ING-ALMOND' || i.name_hi.includes('बादाम'))!;

    const idempotencyKey = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const purchaseData = {
      purchase_date: '2026-09-09',
      payment_method: 'upi' as const,
      paid_amount: 32000,
      idempotency_key: idempotencyKey,
      items: [
        {
          ingredient_id: badam.id,
          purchased_quantity: 10,
          purchase_unit: 'kg' as const,
          unit_price: 3200,
        },
      ],
    };

    const first = await api.createMaterialPurchase(purchaseData, 'usr-owner-001');
    const stockAfterFirst = await api.getAvailableRawMaterialStock(badam.id);

    // Replay with identical idempotency key
    const second = await api.createMaterialPurchase(purchaseData, 'usr-owner-001');
    const stockAfterSecond = await api.getAvailableRawMaterialStock(badam.id);

    expect(second.id).toBe(first.id);
    expect(stockAfterSecond).toBe(stockAfterFirst);
  });

  // 5. Reversal returns BADAM stock to its previous balance
  it('5. Purchase reversal creates negative movement and returns stock to previous balance', async () => {
    const badam = mockStore.getIngredients().find((i) => i.code === 'ING-ALMOND' || i.name_hi.includes('बादाम'))!;
    const stockBefore = await api.getAvailableRawMaterialStock(badam.id);

    const purchase = await api.createMaterialPurchase(
      {
        purchase_date: '2026-09-09',
        payment_method: 'cash',
        paid_amount: 32000,
        items: [
          {
            ingredient_id: badam.id,
            purchased_quantity: 10,
            purchase_unit: 'kg',
            unit_price: 3200,
          },
        ],
      },
      'usr-owner-001'
    );

    expect(await api.getAvailableRawMaterialStock(badam.id)).toBe(stockBefore + 10);

    const reversed = await api.reverseMaterialPurchase(purchase.id, 'Wrong bill entry reversal', 'usr-owner-001');
    expect(reversed).toBe(true);

    const stockAfterReversal = await api.getAvailableRawMaterialStock(badam.id);
    expect(stockAfterReversal).toBe(stockBefore);
  });

  // 6. Unit conversion between kg and g is mathematically precise
  it('6. Unit conversion between kg and g is exact (10 kg = 10,000 g, 500 g = 0.5 kg)', () => {
    expect(convertQuantity(10, 'kg', 'g')).toBe(10000);
    expect(convertQuantity(10000, 'g', 'kg')).toBe(10);
    expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
    expect(convertQuantity(1, 'litre', 'ml')).toBe(1000);
    expect(convertQuantity(250, 'ml', 'litre')).toBe(0.25);

    expect(formatIngredientQuantityWithUnit(2500, 'g')).toBe('2.5 kg (2,500 g)');
    expect(formatIngredientQuantityWithUnit(10, 'kg')).toBe('10 kg');
  });

  // 7. Month bounds helper properly handles Asia/Kolkata timezone
  it('7. getIndiaMonthBounds returns valid first and last day in Asia/Kolkata timezone', () => {
    const testDate = new Date('2026-09-09T10:00:00Z');
    const { startOfMonth, endOfMonth } = getIndiaMonthBounds(testDate);
    expect(startOfMonth).toBe('2026-09-01');
    expect(endOfMonth).toBe('2026-09-30');
  });

  // 8. Refreshing or repeated queries returns deterministic live balance from movements ledger
  it('8. Repeated queries return consistent authoritative stock balances', async () => {
    const badam = mockStore.getIngredients().find((i) => i.code === 'ING-ALMOND' || i.name_hi.includes('बादाम'))!;
    const stockBefore = await api.getAvailableRawMaterialStock(badam.id);

    await api.createMaterialPurchase(
      {
        purchase_date: '2026-09-09',
        payment_method: 'bank_transfer',
        paid_amount: 32000,
        items: [
          {
            ingredient_id: badam.id,
            purchased_quantity: 10,
            purchase_unit: 'kg',
            unit_price: 3200,
          },
        ],
      },
      'usr-owner-001'
    );

    const q1 = await api.getAvailableRawMaterialStock(badam.id);
    const q2 = await api.getAvailableRawMaterialStock(badam.id);
    const balances = await api.getRawMaterialBalances();

    expect(q1).toBe(stockBefore + 10);
    expect(q2).toBe(stockBefore + 10);
    expect(balances[badam.id]).toBe(stockBefore + 10);
  });
});
