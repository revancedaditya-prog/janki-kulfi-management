import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '@/lib/mockStore';

describe('Physical Stock Count Workflow & Ledger Corrections', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('1. Creates a draft stock count containing multiple ingredients without affecting inventory', () => {
    const milk = mockStore.getIngredients().find((i) => i.name_en.toLowerCase().includes('milk') || i.name_hi.includes('दूध')) || mockStore.getIngredients()[0];
    const sugar = mockStore.getIngredients().find((i) => i.name_en.toLowerCase().includes('sugar') || i.name_hi.includes('चीनी')) || mockStore.getIngredients()[1];

    const initialMilkStock = mockStore.getAvailableRawMaterialStock(milk.id);
    const initialSugarStock = mockStore.getAvailableRawMaterialStock(sugar.id);

    const draft = mockStore.createPhysicalStockCount({
      count_date: '2026-09-12',
      notes: 'End of week godown audit draft',
      status: 'draft',
      items: [
        {
          ingredient_id: milk.id,
          physical_stock: initialMilkStock + 5, // 5 kg surplus
          reason: 'Extra unrecorded delivery batch',
        },
        {
          ingredient_id: sugar.id,
          physical_stock: Math.max(0, initialSugarStock - 2), // 2 kg shortage
          reason: 'Spillage during packaging',
        },
      ],
    });

    expect(draft.id).toBeDefined();
    expect(draft.count_number).toMatch(/^PSC-20260912-\d{4}$/);
    expect(draft.status).toBe('draft');
    expect(draft.items).toHaveLength(2);

    // Confirm calculated snapshot fields
    const milkItem = draft.items.find((it) => it.ingredient_id === milk.id)!;
    expect(milkItem.app_stock).toBe(initialMilkStock);
    expect(milkItem.physical_stock).toBe(initialMilkStock + 5);
    expect(milkItem.difference_quantity).toBe(5);
    expect(milkItem.base_unit).toBe(milk.base_unit);
    expect(milkItem.unit_cost_snapshot).toBeGreaterThan(0);
    expect(milkItem.difference_value).toBe(Number((5 * milkItem.unit_cost_snapshot).toFixed(2)));

    const sugarItem = draft.items.find((it) => it.ingredient_id === sugar.id)!;
    expect(sugarItem.app_stock).toBe(initialSugarStock);
    expect(sugarItem.physical_stock).toBe(Math.max(0, initialSugarStock - 2));
    expect(sugarItem.difference_quantity).toBe(Math.max(0, initialSugarStock - 2) - initialSugarStock);

    // Confirm inventory balance is UNCHANGED while in draft status
    expect(mockStore.getAvailableRawMaterialStock(milk.id)).toBe(initialMilkStock);
    expect(mockStore.getAvailableRawMaterialStock(sugar.id)).toBe(initialSugarStock);

    // Confirm no ledger movements were created for draft
    const movements = mockStore.getRawMaterialMovements(milk.id);
    const draftMovements = movements.filter((m) => m.reference_id === draft.id);
    expect(draftMovements).toHaveLength(0);
  });

  it('2. Approves the draft and creates exact signed ledger movements per non-zero difference', () => {
    const milk = mockStore.getIngredients()[0];
    const initialMilkStock = mockStore.getAvailableRawMaterialStock(milk.id);
    const targetPhysicalStock = initialMilkStock + 4;

    const draft = mockStore.createPhysicalStockCount({
      count_date: '2026-09-12',
      notes: 'Weekly store audit',
      status: 'draft',
      items: [
        {
          ingredient_id: milk.id,
          physical_stock: targetPhysicalStock,
          reason: 'Found surplus sealed tin',
        },
      ],
    });

    expect(draft.status).toBe('draft');

    // Approve the draft
    const approved = mockStore.approvePhysicalStockCount(draft.id, 'usr-owner-001');
    expect(approved).toBe(true);

    // Check count header updated
    const count = mockStore.getPhysicalStockCounts().find((c) => c.id === draft.id);
    expect(count?.status).toBe('approved');
    expect(count?.approved_by).toBe('usr-owner-001');

    // Confirm exactly one physical_count_correction movement created
    const movements = mockStore.getRawMaterialMovements(milk.id);
    const corrMove = movements.find((m) => m.reference_id === draft.id && m.movement_type === 'physical_count_correction');
    expect(corrMove).toBeDefined();
    expect(corrMove?.quantity).toBe(4);
    expect(corrMove?.reference_table).toBe('physical_stock_counts');

    // Confirm inventory now matches physical stock exactly
    expect(mockStore.getAvailableRawMaterialStock(milk.id)).toBe(targetPhysicalStock);
  });

  it('3. Approving an already approved count is idempotent and does not create duplicate movements', () => {
    const milk = mockStore.getIngredients()[0];
    const initialStock = mockStore.getAvailableRawMaterialStock(milk.id);

    const count = mockStore.createPhysicalStockCount({
      count_date: '2026-09-12',
      status: 'approved',
      items: [
        {
          ingredient_id: milk.id,
          physical_stock: initialStock - 1,
          reason: 'Evaporation loss',
        },
      ],
    });

    const movesCountAfterFirstApproval = mockStore.getRawMaterialMovements(milk.id).length;

    // Approve again
    const reApprove = mockStore.approvePhysicalStockCount(count.id, 'usr-owner-001');
    expect(reApprove).toBe(true);

    const movesCountAfterSecondApproval = mockStore.getRawMaterialMovements(milk.id).length;
    expect(movesCountAfterSecondApproval).toBe(movesCountAfterFirstApproval);
  });

  it('4. Items with zero difference do not produce unnecessary ledger correction movements', () => {
    const milk = mockStore.getIngredients()[0];
    const currentStock = mockStore.getAvailableRawMaterialStock(milk.id);

    const count = mockStore.createPhysicalStockCount({
      count_date: '2026-09-12',
      status: 'approved',
      items: [
        {
          ingredient_id: milk.id,
          physical_stock: currentStock, // Exact match
          reason: 'Count matches perfectly',
        },
      ],
    });

    const movements = mockStore.getRawMaterialMovements(milk.id).filter((m) => m.reference_id === count.id);
    expect(movements).toHaveLength(0);
    expect(mockStore.getAvailableRawMaterialStock(milk.id)).toBe(currentStock);
  });
});
