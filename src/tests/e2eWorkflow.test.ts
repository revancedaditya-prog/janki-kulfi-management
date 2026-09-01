import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '@/lib/mockStore';

describe('Janki Kulfi End-to-End Business Flow Simulation', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  it('executes a complete end-to-end business day lifecycle', () => {
    const today = '2026-08-31';
    const owner = mockStore.getProfiles().find((p) => p.role === 'owner')!;
    expect(owner).toBeDefined();

    const products = mockStore.getProducts();
    const sada = products.find((p) => p.sku === 'JK-SADA-01')!; // ₹10, comm ₹2
    const rabri = products.find((p) => p.sku === 'JK-RABRI-02')!; // ₹20, comm ₹4
    const prem = products.find((p) => p.sku === 'JK-PREM-03')!; // ₹40, comm ₹8
    const ramesh = mockStore.getSellers()[0]; // Ramesh Kumar

    // STEP 1: Morning Production
    // Produce 100 Sada, 50 Rabri, 20 Premium with ₹700 ingredient cost
    const batch = mockStore.createProductionBatch(
      today,
      700,
      'Full Day Production',
      [
        { product_id: sada.id, produced_quantity: 100, damaged_quantity: 2 }, // 98 saleable
        { product_id: rabri.id, produced_quantity: 50, damaged_quantity: 0 }, // 50 saleable
        { product_id: prem.id, produced_quantity: 20, damaged_quantity: 0 }, // 20 saleable
      ],
      owner.id
    );

    // Complete Production
    mockStore.completeProductionBatch(batch.id, owner.id);

    // Verify Freezer Stock after production
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(98);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(50);
    expect(mockStore.getAvailableFreezerStock(prem.id)).toBe(20);

    // STEP 2: Stock Issue to Seller Ramesh
    // Issue 50 Sada, 30 Rabri, 10 Premium
    const issue = mockStore.issueSellerStock(
      ramesh.id,
      ramesh.default_cart_id || null,
      today,
      [
        { product_id: sada.id, issued_quantity: 50 },
        { product_id: rabri.id, issued_quantity: 30 },
        { product_id: prem.id, issued_quantity: 10 },
      ],
      'Morning cart issue',
      owner.id
    );

    expect(issue.status).toBe('issued');
    // Freezer Stock deducted
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(48); // 98 - 50
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(20); // 50 - 30
    expect(mockStore.getAvailableFreezerStock(prem.id)).toBe(10); // 20 - 10

    // STEP 3: Evening Return & Settlement
    // Sada: 50 issued -> 5 returned, 1 damaged (sun melt), 0 comp => 44 sold (₹440 gross, ₹88 comm)
    // Rabri: 30 issued -> 4 returned, 0 damaged, 1 comp (tasting) => 25 sold (₹500 gross, ₹100 comm)
    // Prem: 10 issued -> 2 returned, 0 damaged, 0 comp => 8 sold (₹320 gross, ₹64 comm)
    // Total Sold = 77 pieces.
    // Total Gross = ₹440 + ₹500 + ₹320 = ₹1260.
    // Total Commission = ₹88 + ₹100 + ₹64 = ₹252.
    // Expected Collection = ₹1260 - ₹252 = ₹1008.
    // Payment: Cash ₹800 + UPI ₹200 + Credit ₹8 = ₹1008 Total Accounted. Shortage = 0.
    const sadaIssueItem = issue.items.find((i) => i.product_id === sada.id)!;
    const rabriIssueItem = issue.items.find((i) => i.product_id === rabri.id)!;
    const premIssueItem = issue.items.find((i) => i.product_id === prem.id)!;

    const settlement = mockStore.processSellerSettlement(
      issue.id,
      today,
      [
        {
          issue_item_id: sadaIssueItem.id,
          returned_quantity: 5,
          damaged_quantity: 1,
          complimentary_quantity: 0,
          damage_reason: 'Dhoop me pighli',
        },
        {
          issue_item_id: rabriIssueItem.id,
          returned_quantity: 4,
          damaged_quantity: 0,
          complimentary_quantity: 1,
          complimentary_reason: 'Grahak ko tasting',
        },
        {
          issue_item_id: premIssueItem.id,
          returned_quantity: 2,
          damaged_quantity: 0,
          complimentary_quantity: 0,
        },
      ],
      800, // Cash
      200, // UPI
      8, // Credit
      'Full settlement approved by owner',
      true, // Owner approved immediately
      owner.id
    );

    expect(settlement.status).toBe('approved');
    expect(settlement.gross_sales).toBe(1260);
    expect(settlement.total_commission).toBe(252);
    expect(settlement.expected_collection).toBe(1008);
    expect(settlement.total_received).toBe(1000);
    expect(settlement.shortage_amount).toBe(0);

    // Verify Unsold Returns Restocked into Freezer!
    // Sada: 48 + 5 = 53
    // Rabri: 20 + 4 = 24
    // Prem: 10 + 2 = 12
    expect(mockStore.getAvailableFreezerStock(sada.id)).toBe(53);
    expect(mockStore.getAvailableFreezerStock(rabri.id)).toBe(24);
    expect(mockStore.getAvailableFreezerStock(prem.id)).toBe(12);

    // STEP 4: Operating Expenses
    mockStore.addExpense(
      {
        expense_date: today,
        category: 'generator_fuel',
        amount: 150,
        payment_method: 'cash',
        description: 'Diesel for freezer generator',
        vendor_name: 'Gupta Petrol Pump',
        bill_image_path: null,
      },
      owner.id
    );

    // STEP 5: Daily Closing
    // Expected Daily Profit = Gross Sales (1260) - Commission (252) - Ingredient Costs (700) - Operating Expenses (150) = ₹158.
    const closing = mockStore.closeBusinessDay(today, 'Successful business day', owner.id);

    expect(closing.status).toBe('closed');
    expect(closing.gross_sales).toBe(1260);
    expect(closing.total_commission).toBe(252);
    expect(closing.total_sold).toBe(77);
    expect(closing.total_expenses).toBe(150);
    expect(closing.estimated_profit).toBe(158);

    // STEP 6: Verify Dashboard Summary reflects the closed day
    const dashboard = mockStore.getDashboardSummary(today);
    expect(dashboard.is_day_closed).toBe(true);
    expect(dashboard.estimated_profit).toBe(158);
    expect(dashboard.unsettled_issues_count).toBe(0);

    // STEP 7: Reopening test
    const reopened = mockStore.reopenBusinessDay(today, 'Late evening expense entry correction', owner.id);
    expect(reopened.status).toBe('reopened');
    expect(reopened.reopen_reason).toBe('Late evening expense entry correction');
  });
});
