import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export function useSellerSettlements() {
  return useQuery({
    queryKey: ['seller_settlements'],
    queryFn: () => api.getSellerSettlements(),
  });
}

export function useProcessSettlement() {
  const queryClient = useQueryClient();
  const { user, isOwner } = useAuth();

  return useMutation({
    mutationFn: async ({
      issueId,
      settlementDate,
      items,
      cashReceived,
      upiReceived,
      creditAmount,
      notes,
    }: {
      issueId: string;
      settlementDate: string;
      items: {
        issue_item_id: string;
        returned_quantity: number;
        damaged_quantity: number;
        complimentary_quantity: number;
        damage_reason?: string;
        complimentary_reason?: string;
      }[];
      cashReceived: number;
      upiReceived: number;
      creditAmount: number;
      notes: string;
    }) => {
      return api.processSellerSettlement(
        issueId,
        settlementDate,
        items,
        cashReceived,
        upiReceived,
        creditAmount,
        notes,
        isOwner, // Auto-approve if submitted by owner, otherwise mark pending
        user?.id || 'usr-owner-001'
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller_settlements'] });
      queryClient.invalidateQueries({ queryKey: ['seller_issues'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useApproveSettlement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settlementId: string) => {
      return api.approvePendingSettlement(settlementId, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller_settlements'] });
      queryClient.invalidateQueries({ queryKey: ['seller_issues'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}
