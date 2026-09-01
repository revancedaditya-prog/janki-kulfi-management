import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api.getProducts(),
  });
}

export function usePriceHistory(productId: string) {
  return useQuery({
    queryKey: ['price_history', productId],
    queryFn: () => api.getPriceHistory(productId),
    enabled: Boolean(productId),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      product,
      sellingPrice,
      commissionType,
      commissionValue,
    }: {
      product: { name_en: string; name_hi: string; sku: string; description?: string };
      sellingPrice: number;
      commissionType: 'fixed' | 'percentage';
      commissionValue: number;
    }) => {
      return api.createProduct(
        product,
        sellingPrice,
        commissionType,
        commissionValue,
        user?.id || 'usr-owner-001'
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProductPrice() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      productId,
      sellingPrice,
      commissionType,
      commissionValue,
    }: {
      productId: string;
      sellingPrice: number;
      commissionType: 'fixed' | 'percentage';
      commissionValue: number;
    }) => {
      return api.updateProductPrice(
        productId,
        sellingPrice,
        commissionType,
        commissionValue,
        user?.id || 'usr-owner-001'
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['price_history', variables.productId] });
    },
  });
}
