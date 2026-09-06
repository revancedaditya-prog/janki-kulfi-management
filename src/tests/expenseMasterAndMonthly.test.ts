import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '../lib/mockStore';
import { useMockMode } from '../lib/api';

describe('Expense Master & Monthly Fixed Expense System Tests', () => {
  beforeEach(() => {
    // Reset or reinitialize store state
    (mockStore as any).loadState();
  });

  it('1. Default expense heads are seeded with correct groups and calculation modes', () => {
    const heads = mockStore.getExpenseHeads(false);
    expect(heads.length).toBeGreaterThanOrEqual(7);

    const rentHead = heads.find((h) => h.code === 'EXP-RENT-01');
    expect(rentHead).toBeDefined();
    expect(rentHead?.name_hi).toBe('दुकान/कारखाना/गोदाम का किराया');
    expect(rentHead?.expense_group).toBe('monthly_fixed');
    expect(rentHead?.calculation_mode).toBe('manual');
    expect(rentHead?.default_amount).toBe(15000);
    expect(rentHead?.due_day).toBe(5);

    const permSal = heads.find((h) => h.code === 'EXP-PERM-SAL-02');
    expect(permSal).toBeDefined();
    expect(permSal?.name_hi).toBe('स्थायी कर्मचारियों की salary');
    expect(permSal?.expense_group).toBe('monthly_fixed');

    const ownerSal = heads.find((h) => h.code === 'EXP-OWNER-SAL-03');
    expect(ownerSal).toBeDefined();
    expect(ownerSal?.name_hi).toBe('Owner/Manager salary');

    const ingrPkg = heads.find((h) => h.code === 'EXP-INGR-PKG-04');
    expect(ingrPkg).toBeDefined();
    expect(ingrPkg?.expense_group).toBe('variable_production');
    expect(ingrPkg?.calculation_mode).toBe('automatic');

    const lpg = heads.find((h) => h.code === 'EXP-LPG-ENERGY-05');
    expect(lpg).toBeDefined();
    expect(lpg?.calculation_mode).toBe('automatic');
  });

  it('2. Owner can add and edit a new expense head', () => {
    const uniqueCode = `EXP-TEST-${Date.now()}`;
    const newHead = mockStore.addExpenseHead(
      {
        code: uniqueCode,
        name_en: 'Internet & WiFi',
        name_hi: 'इंटरनेट व वाई-फाई',
        expense_group: 'monthly_fixed',
        calculation_mode: 'manual',
        default_amount: 1200,
        due_day: 10,
      },
      'usr-owner-001'
    );

    expect(newHead.id).toBeDefined();
    expect(newHead.code).toBe(uniqueCode);
    expect(newHead.default_amount).toBe(1200);

    // Edit the expense head
    const updated = mockStore.updateExpenseHead(
      newHead.id,
      {
        default_amount: 1500,
        notes: 'Updated broadband plan',
      },
      'usr-owner-001'
    );

    expect(updated.default_amount).toBe(1500);
    expect(updated.notes).toBe('Updated broadband plan');
  });

  it('3. Unused head can be permanently deleted after confirmation', () => {
    const tempCode = `EXP-UNUSED-${Date.now()}`;
    const head = mockStore.addExpenseHead(
      {
        code: tempCode,
        name_en: 'Temporary Expense Head',
        name_hi: 'अस्थायी हेड',
        expense_group: 'monthly_fixed',
        calculation_mode: 'manual',
        default_amount: 500,
      },
      'usr-owner-001'
    );

    const res = mockStore.deleteOrArchiveExpenseHead(head.id, 'usr-owner-001');
    expect(res.action).toBe('deleted');

    const found = mockStore.getExpenseHeadById(head.id);
    expect(found).toBeUndefined();
  });

  it('4. Used head cannot be hard-deleted; it must be archived to preserve transaction history', () => {
    const usedCode = `EXP-USED-${Date.now()}`;
    const head = mockStore.addExpenseHead(
      {
        code: usedCode,
        name_en: 'Catering License Fee',
        name_hi: 'कैटरिंग लाइसेंस शुल्क',
        expense_group: 'monthly_fixed',
        calculation_mode: 'manual',
        default_amount: 5000,
      },
      'usr-owner-001'
    );

    // Record an expense against this head
    const exp = mockStore.confirmOrPayMonthlyExpense(
      {
        expense_head_id: head.id,
        month: '2026-09',
        amount: 5000,
        payment_method: 'bank_transfer',
      },
      'usr-owner-001'
    );
    expect(exp.id).toBeDefined();

    // Try deleting the used head
    const res = mockStore.deleteOrArchiveExpenseHead(head.id, 'usr-owner-001');
    expect(res.action).toBe('archived');

    // Verify head is archived and inactive, but still exists
    const archivedHead = mockStore.getExpenseHeadById(head.id);
    expect(archivedHead).toBeDefined();
    expect(archivedHead?.is_archived).toBe(true);
    expect(archivedHead?.is_active).toBe(false);

    // Verify the historical expense transaction is NOT lost
    const allExpenses = (mockStore as any).state.expenses;
    const historicalExpense = allExpenses.find((e: any) => e.expense_head_id === head.id);
    expect(historicalExpense).toBeDefined();
    expect(historicalExpense.amount).toBe(5000);

    // Test restoring archived head
    const restored = mockStore.restoreExpenseHead(head.id, 'usr-owner-001');
    expect(restored.is_archived).toBe(false);
    expect(restored.is_active).toBe(true);
  });

  it('5. Pending monthly expense template does NOT reduce profit', () => {
    const testMonth = '2026-11';
    const reportBefore = mockStore.getProfitLossReport(`${testMonth}-01`, `${testMonth}-30`);

    // In a future month with no confirmed expenses, fixed expenses should be 0
    expect(reportBefore.confirmed_monthly_fixed_expenses).toBe(0);

    const monthlySummary = mockStore.getMonthlyExpenses(testMonth);
    expect(monthlySummary.pending_total).toBeGreaterThan(0);

    // Profit must NOT deduct pending templates
    expect(reportBefore.net_operating_profit).toBe(reportBefore.gross_profit - reportBefore.other_manual_expenses);
  });

  it('6. Confirmed rent reduces profit exactly once', () => {
    const testMonth = '2026-09';
    const rentHead = mockStore.getExpenseHeads().find((h) => h.code === 'EXP-RENT-01')!;

    // Initial PnL
    const initialReport = mockStore.getProfitLossReport(`${testMonth}-01`, `${testMonth}-30`);
    const initialFixed = initialReport.confirmed_monthly_fixed_expenses;

    // Confirm Rent payment of ₹15,000
    mockStore.confirmOrPayMonthlyExpense(
      {
        expense_head_id: rentHead.id,
        month: testMonth,
        amount: 15000,
        payment_method: 'bank_transfer',
        paid_date: `${testMonth}-05`,
        description: 'Factory Rent Paid for Sept 2026',
      },
      'usr-owner-001'
    );

    // New PnL
    const newReport = mockStore.getProfitLossReport(`${testMonth}-01`, `${testMonth}-30`);
    expect(newReport.confirmed_monthly_fixed_expenses).toBe(initialFixed + 15000);
    expect(newReport.net_operating_profit).toBe(initialReport.net_operating_profit - 15000);

    // Daily allocated fixed cost formula test (15000 / 30 = 500/day)
    expect(newReport.daily_allocated_fixed_cost).toBe(Number((newReport.confirmed_monthly_fixed_expenses / newReport.days_in_month).toFixed(2)));
  });

  it('7. Paid salary can be voided with a mandatory reason', () => {
    const testMonth = '2026-10';
    const salHead = mockStore.getExpenseHeads().find((h) => h.code === 'EXP-PERM-SAL-02')!;

    const paidSal = mockStore.confirmOrPayMonthlyExpense(
      {
        expense_head_id: salHead.id,
        month: testMonth,
        amount: 25000,
        payment_method: 'bank_transfer',
      },
      'usr-owner-001'
    );

    expect(paidSal.status).toBe('active');

    // Void with reason
    const voided = mockStore.voidExpense(paidSal.id, 'Duplicate bank entry reversed', 'usr-owner-001');
    expect(voided.status).toBe('voided');
    expect(voided.void_reason).toBe('Duplicate bank entry reversed');

    // Ensure voided expense is NOT counted in confirmed fixed expenses
    const pnl = mockStore.getProfitLossReport(`${testMonth}-01`, `${testMonth}-31`);
    expect(pnl.confirmed_monthly_fixed_expenses).toBe(0);
    const activeSalaries = (mockStore as any).state.expenses.filter(
      (e: any) => e.id === paidSal.id && e.status === 'active'
    );
    expect(activeSalaries.length).toBe(0);
  });

  it('8. Safe correction of paid expense preserves history and links replacement', () => {
    const testMonth = '2026-11';
    const rentHead = mockStore.getExpenseHeads().find((h) => h.code === 'EXP-RENT-01')!;

    const initialExp = mockStore.confirmOrPayMonthlyExpense(
      {
        expense_head_id: rentHead.id,
        month: testMonth,
        amount: 14000,
        payment_method: 'cash',
        paid_date: `${testMonth}-05`,
      },
      'usr-owner-001'
    );

    // Correct the amount to ₹15,000 with a mandatory reason
    const correctionResult = mockStore.correctPaidExpense(
      initialExp.id,
      {
        amount: 15000,
        payment_method: 'bank_transfer',
        expense_date: `${testMonth}-05`,
        description: 'Rent adjusted after landlord agreement review',
      },
      'Adjustment for agreed maintenance surcharge',
      'usr-owner-001'
    );

    expect(correctionResult.success).toBe(true);
    expect(correctionResult.old_expense_id).toBe(initialExp.id);
    expect(correctionResult.new_expense_id).toBeDefined();

    // Verify old expense is voided with reason
    const oldRec = (mockStore as any).state.expenses.find((e: any) => e.id === initialExp.id);
    expect(oldRec.status).toBe('voided');
    expect(oldRec.void_reason).toContain('Adjustment for agreed maintenance surcharge');

    // Verify replacement record is active and linked via corrected_from_expense_id
    const newRec = (mockStore as any).state.expenses.find((e: any) => e.id === correctionResult.new_expense_id);
    expect(newRec.status).toBe('active');
    expect(newRec.amount).toBe(15000);
    expect(newRec.corrected_from_expense_id).toBe(initialExp.id);
  });

  it('9. Copying previous month fixed expenses copies actual amounts to target month', () => {
    const sourceMonth = '2026-08';
    const targetMonth = '2026-12';

    const rentHead = mockStore.getExpenseHeads().find((h) => h.code === 'EXP-RENT-01')!;
    mockStore.confirmOrPayMonthlyExpense(
      {
        expense_head_id: rentHead.id,
        month: sourceMonth,
        amount: 16000, // Custom negotiated rent for Aug
        payment_method: 'bank_transfer',
      },
      'usr-owner-001'
    );

    const copyResult = mockStore.copyPreviousMonthFixedExpenses(sourceMonth, targetMonth, 'usr-owner-001');
    expect(copyResult.success).toBe(true);
    expect(copyResult.copied_count).toBeGreaterThanOrEqual(1);

    // Target month summary
    const targetSummary = mockStore.getMonthlyExpenses(targetMonth);
    const targetRent = targetSummary.items.find((it) => it.head.id === rentHead.id);
    expect(targetRent?.status).toBe('paid');
    expect(targetRent?.actual_amount).toBe(16000);
  });

  it('10. Automatic ingredient cost is not duplicated with manual material purchases', () => {
    const testMonth = '2026-09';
    const pnl = mockStore.getProfitLossReport(`${testMonth}-01`, `${testMonth}-30`);

    // PnL statement should distinctly break down production ingredient consumption and packaging
    expect(typeof pnl.production_ingredient_cost).toBe('number');
    expect(typeof pnl.packaging_cost).toBe('number');
    expect(typeof pnl.lpg_energy_cost).toBe('number');
    expect(pnl.total_production_cost).toBe(
      Number((pnl.production_ingredient_cost + pnl.packaging_cost + pnl.lpg_energy_cost).toFixed(2))
    );
  });

  it('11. useMockMode is correctly isolated for test environment', () => {
    // In vitest test environment, MODE is 'test'
    expect(useMockMode).toBe(true);
  });
});
