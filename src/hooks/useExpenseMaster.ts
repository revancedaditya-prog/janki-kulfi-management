import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ExpenseHead, PaymentMethod } from '@/types';

export function useExpenseHeads(includeArchived = false) {
  return useQuery({
    queryKey: ['expense_heads', includeArchived],
    queryFn: () => api.getExpenseHeads(includeArchived),
  });
}

export function useCreateExpenseHead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (head: Partial<ExpenseHead>) => {
      return api.createExpenseHead(head, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_heads'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_expenses'] });
      queryClient.invalidateQueries({ queryKey: ['profit_loss'] });
    },
  });
}

export function useUpdateExpenseHead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      headId,
      updates,
    }: {
      headId: string;
      updates: Partial<ExpenseHead>;
    }) => {
      return api.updateExpenseHead(headId, updates, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_heads'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_expenses'] });
      queryClient.invalidateQueries({ queryKey: ['profit_loss'] });
    },
  });
}

export function useDeleteOrArchiveExpenseHead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (headId: string) => {
      return api.deleteOrArchiveExpenseHead(headId, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_heads'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_expenses'] });
      queryClient.invalidateQueries({ queryKey: ['profit_loss'] });
    },
  });
}

export function useRestoreExpenseHead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (headId: string) => {
      return api.restoreExpenseHead(headId, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_heads'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_expenses'] });
      queryClient.invalidateQueries({ queryKey: ['profit_loss'] });
    },
  });
}

export function useMonthlyExpenses(month: string) {
  return useQuery({
    queryKey: ['monthly_expenses', month],
    queryFn: () => api.getMonthlyExpenses(month),
    enabled: !!month,
  });
}

export function useConfirmMonthlyExpense() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      expense_head_id: string;
      month: string;
      amount: number;
      payment_method: PaymentMethod;
      paid_date?: string;
      description?: string;
      vendor_name?: string;
      bill_image_path?: string;
    }) => {
      return api.confirmOrPayMonthlyExpense(data, user?.id || 'usr-owner-001');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['monthly_expenses', variables.month] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['profit_loss'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useCorrectPaidExpense() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      expenseId,
      updates,
      reason,
    }: {
      expenseId: string;
      updates: {
        amount: number;
        payment_method?: PaymentMethod;
        expense_date?: string;
        description?: string;
      };
      reason: string;
    }) => {
      return api.correctPaidExpense(expenseId, updates, reason, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly_expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['profit_loss'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useCopyPreviousMonthExpenses() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      sourceMonth,
      targetMonth,
    }: {
      sourceMonth: string;
      targetMonth: string;
    }) => {
      return api.copyPreviousMonthFixedExpenses(sourceMonth, targetMonth, user?.id || 'usr-owner-001');
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['monthly_expenses', variables.targetMonth] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['profit_loss'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useProfitLossReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['profit_loss', fromDate, toDate],
    queryFn: () => api.getProfitLossReport(fromDate, toDate),
    enabled: !!fromDate && !!toDate,
  });
}
