import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { invalidateAndRefetchStockQueries } from './useProducts';

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
    onSuccess: async () => {
      await invalidateAndRefetchStockQueries(queryClient);
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
    onSuccess: async () => {
      await invalidateAndRefetchStockQueries(queryClient);
    },
  });
}

export function useCompleteProductionWithRecipeTransaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      productionDate: string;
      productId: string;
      producedQuantity: number;
      damagedQuantity?: number;
      recipeId?: string;
      actualIngredients?: { ingredient_id: string; actual_quantity: number; unit: any; reason?: string }[];
      notes?: string;
      lpgCost?: number;
      overheadCosts?: any;
      idempotencyKey?: string;
    }) => {
      return api.completeProductionWithRecipeTransaction({
        ...params,
        userId: user?.id || 'usr-owner-001',
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['production_batches'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['ingredients'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['raw-material-movements'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['stock-locations'], exact: false });
      await invalidateAndRefetchStockQueries(queryClient);
    },
  });
}

export function useCompleteProductionWithRawMaterials() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      batchId,
      rawMaterials,
      allowEmergencyOverride,
      overrideReason,
    }: {
      batchId: string;
      rawMaterials: { ingredient_id: string; quantity_used: number; unit: any; lot_id?: string | null }[];
      allowEmergencyOverride?: boolean;
      overrideReason?: string;
    }) => {
      return api.completeProductionWithRawMaterials(
        batchId,
        rawMaterials,
        allowEmergencyOverride,
        overrideReason,
        user?.id || 'usr-owner-001'
      );
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['raw-material-movements'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['stock-locations'], exact: false });
      await invalidateAndRefetchStockQueries(queryClient);
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
      queryClient.invalidateQueries({ queryKey: ['production_batches'], exact: false });
    },
  });
}

export function useUpdateDraftProductionBatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      batchId,
      productionDate,
      totalIngredientCost,
      notes,
      items,
    }: {
      batchId: string;
      productionDate: string;
      totalIngredientCost: number;
      notes: string;
      items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[];
    }) => {
      return api.updateDraftProductionBatch(
        batchId,
        productionDate,
        totalIngredientCost,
        notes,
        items,
        user?.id || 'usr-owner-001'
      );
    },
    onSuccess: async () => {
      await invalidateAndRefetchStockQueries(queryClient);
    },
  });
}

export function useCorrectProductionBatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      batchId,
      productionDate,
      totalIngredientCost,
      notes,
      items,
      reason,
    }: {
      batchId: string;
      productionDate: string;
      totalIngredientCost: number;
      notes: string;
      items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[];
      reason: string;
    }) => {
      return api.correctProductionBatch(
        batchId,
        productionDate,
        totalIngredientCost,
        notes,
        items,
        reason,
        user?.id || 'usr-owner-001'
      );
    },
    onSuccess: async () => {
      await invalidateAndRefetchStockQueries(queryClient);
    },
  });
}

export function useProductionRevisionHistory(batchId?: string) {
  return useQuery({
    queryKey: ['production_revisions', batchId],
    queryFn: () => (batchId ? api.getProductionRevisionHistory(batchId) : Promise.resolve([])),
    enabled: !!batchId,
  });
}

export function useDeleteProductionBatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ batchId, reason }: { batchId: string; reason?: string }) => {
      return api.deleteProductionBatch(batchId, reason || 'Deleted by Owner', user?.id || 'usr-owner-001');
    },
    onSuccess: async () => {
      await invalidateAndRefetchStockQueries(queryClient);
    },
  });
}
