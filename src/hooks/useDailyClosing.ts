import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export function useDailyClosings() {
  return useQuery({
    queryKey: ['daily_closings'],
    queryFn: () => api.getDailyClosings(),
  });
}

export function useCloseBusinessDay() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ businessDate, notes }: { businessDate: string; notes: string }) => {
      return api.closeBusinessDay(businessDate, notes, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily_closings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useReopenBusinessDay() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ businessDate, reason }: { businessDate: string; reason: string }) => {
      return api.reopenBusinessDay(businessDate, reason, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily_closings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}
