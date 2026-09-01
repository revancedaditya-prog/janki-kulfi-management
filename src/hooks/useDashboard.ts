import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getTodayDateString } from '@/lib/formatters';

export function useDashboard(dateStr = getTodayDateString()) {
  return useQuery({
    queryKey: ['dashboard_summary', dateStr],
    queryFn: () => api.getDashboardSummary(dateStr),
    refetchInterval: 15000,
  });
}
