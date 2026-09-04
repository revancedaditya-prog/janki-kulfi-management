import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { AdditionalOverheads, UnitType, Ingredient } from '@/types';

export function useIngredients() {
  return useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api.getIngredients(),
  });
}

export function useAddIngredient() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (ingredient: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'>) =>
      api.createIngredient(ingredient, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}

export function useUpdateIngredientRate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({
      ingredientId,
      newRate,
      unit,
      saveToMaster,
    }: {
      ingredientId: string;
      newRate: number;
      unit: UnitType;
      saveToMaster: boolean;
    }) =>
      api.updateIngredientRate(
        ingredientId,
        newRate,
        unit,
        saveToMaster,
        user?.id || 'usr-owner-001'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}

export function useRecipeForProduct(productId?: string) {
  return useQuery({
    queryKey: ['recipe', productId],
    queryFn: () => (productId ? api.getRecipeForProduct(productId) : undefined),
    enabled: !!productId,
  });
}

export function useRecipeHistory(productId?: string) {
  return useQuery({
    queryKey: ['recipe_history', productId],
    queryFn: () => (productId ? api.getRecipeHistory(productId) : []),
    enabled: !!productId,
  });
}

export function useSaveRecipe() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      product_id: string;
      name?: string;
      standard_output_pieces: number;
      default_overheads: AdditionalOverheads;
      notes?: string;
      items: {
        ingredient_id: string;
        quantity: number;
        unit: UnitType;
        save_rate_to_master?: boolean;
        rate?: number;
      }[];
    }) => api.saveRecipe(data, user?.id || 'usr-owner-001'),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recipe', variables.product_id] });
      queryClient.invalidateQueries({ queryKey: ['recipe_history', variables.product_id] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}

import { invalidateAndRefetchStockQueries } from './useProducts';

export function useCreateProductionCostingBatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      productionDate: string;
      productId: string;
      recipeId?: string;
      producedQuantity: number;
      damagedQuantity: number;
      totalIngredientCost: number;
      overheadCosts: AdditionalOverheads;
      totalBatchCost: number;
      costPerPiece: number;
      expectedSales: number;
      estimatedGrossProfit: number;
      grossMarginPercentage: number;
      ingredients: {
        ingredient_id?: string;
        ingredient_name: string;
        quantity_used: number;
        unit: UnitType;
        converted_base_quantity: number;
        rate_snapshot: number;
        rate_unit: UnitType;
        calculated_cost: number;
        is_packaging: boolean;
      }[];
      notes?: string;
    }) => api.createProductionCostingBatch(data, user?.id || 'usr-owner-001'),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['stock_locations'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['dashboard'], exact: false });
      await invalidateAndRefetchStockQueries(queryClient);
    },
  });
}

