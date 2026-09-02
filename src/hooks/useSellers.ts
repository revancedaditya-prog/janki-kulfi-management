import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export function useSellers() {
  return useQuery({
    queryKey: ['sellers'],
    queryFn: () => api.getSellers(),
  });
}

export function useCarts() {
  return useQuery({
    queryKey: ['carts'],
    queryFn: () => api.getCarts(),
  });
}

export function useCreateSeller() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (seller: {
      seller_code: string;
      full_name: string;
      phone?: string;
      address?: string;
      default_cart_id?: string;
      opening_balance?: number;
    }) => {
      return api.createSeller(seller, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
    },
  });
}

export function useUpdateSeller() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        seller_code?: string;
        full_name?: string;
        phone?: string;
        address?: string;
        default_cart_id?: string | null;
        is_active?: boolean;
        opening_balance?: number;
      };
    }) => {
      return api.updateSeller(id, updates as any, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useDeleteSeller() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      return api.deleteSeller(id, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useCreateCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cart: { cart_code: string; cart_name: string; location?: string }) => {
      return api.createCart(cart);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

export function useUpdateCart() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        cart_code?: string;
        cart_name?: string;
        location?: string;
        is_active?: boolean;
      };
    }) => {
      return api.updateCart(id, updates, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
    },
  });
}

export function useDeleteCart() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      return api.deleteCart(id, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
    },
  });
}

export function useSellerIssues() {
  return useQuery({
    queryKey: ['seller_issues'],
    queryFn: () => api.getSellerIssues(),
  });
}

export function useIssueSellerStock() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      sellerId,
      cartId,
      issueDate,
      items,
      notes,
    }: {
      sellerId: string;
      cartId: string | null;
      issueDate: string;
      items: { product_id: string; issued_quantity: number }[];
      notes: string;
    }) => {
      return api.issueSellerStock(sellerId, cartId, issueDate, items, notes, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller_issues'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useUpdateDraftSellerIssue() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      issueId,
      issueDate,
      sellerId,
      cartId,
      items,
      notes,
    }: {
      issueId: string;
      issueDate: string;
      sellerId: string;
      cartId: string | null;
      items: { product_id: string; issued_quantity: number }[];
      notes: string;
    }) => {
      return api.updateDraftSellerIssue(issueId, issueDate, sellerId, cartId, items, notes, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller_issues'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useCancelDraftSellerIssue() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (issueId: string) => {
      return api.cancelDraftSellerIssue(issueId, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller_issues'] });
    },
  });
}

export function useCorrectSellerIssue() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      issueId,
      issueDate,
      sellerId,
      cartId,
      items,
      notes,
      reason,
    }: {
      issueId: string;
      issueDate: string;
      sellerId: string;
      cartId: string | null;
      items: { product_id: string; issued_quantity: number }[];
      notes: string;
      reason: string;
    }) => {
      return api.correctSellerIssue(issueId, issueDate, sellerId, cartId, items, notes, reason, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller_issues'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useIssueRevisionHistory(issueId?: string) {
  return useQuery({
    queryKey: ['issue_revisions', issueId],
    queryFn: () => (issueId ? api.getIssueRevisionHistory(issueId) : Promise.resolve([])),
    enabled: !!issueId,
  });
}

export function useDeleteSellerIssue() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ issueId, reason }: { issueId: string; reason?: string }) => {
      return api.deleteSellerIssue(issueId, reason || 'Deleted by Owner', user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller_issues'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sellers'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}
