import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export function useProductionBatches() {
  return useQuery({
    queryKey: ['production_batches'],
    queryFn: () => api.getProductionBatches(),
  });
}

export function useCreateProductionBatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      productionDate,
      totalIngredientCost,
      notes,
      items,
    }: {
      productionDate: string;
      totalIngredientCost: number;
      notes: string;
      items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[];
    }) => {
      return api.createProductionBatch(
        productionDate,
        totalIngredientCost,
        notes,
        items,
        user?.id || 'usr-owner-001'
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production_batches'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useCompleteProductionBatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (batchId: string) => {
      return api.completeProductionBatch(batchId, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production_batches'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
    },
  });
}

export function useCancelProductionBatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (batchId: string) => {
      return api.cancelProductionBatch(batchId, user?.id || 'usr-owner-001');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production_batches'] });
    },
  });
}
