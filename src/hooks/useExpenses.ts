import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ExpenseCategory, PaymentMethod } from '@/types';

export function useExpenses() {
  return useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.getExpenses(),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (expense: {
      expense_date: string;
      category: ExpenseCategory;
      amount: number;
      payment_method: PaymentMethod;
      description: string;
      vendor_name?: string;
      bill_image_path?: string;
    }) => {
      return api.createExpense(expense, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useVoidExpense() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ expenseId, voidReason }: { expenseId: string; voidReason: string }) => {
      return api.voidExpense(expenseId, voidReason, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      expenseId,
      updates,
    }: {
      expenseId: string;
      updates: {
        expense_date?: string;
        category?: ExpenseCategory;
        amount?: number;
        payment_method?: PaymentMethod;
        description?: string;
        vendor_name?: string;
        bill_image_path?: string;
      };
    }) => {
      return api.updateExpense(expenseId, updates, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (expenseId: string) => {
      return api.deleteExpense(expenseId, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}
