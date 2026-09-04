import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Ingredient, UnitType, InventoryWastage } from '@/types';
import { useAuth } from '@/context/AuthContext';

// --- Ingredients & Master ---
export function useIngredients(includeInactive: boolean = false) {
  return useQuery({
    queryKey: ['ingredients', { includeInactive }],
    queryFn: () => api.getIngredients(includeInactive),
  });
}

export function useIngredient(id: string) {
  return useQuery({
    queryKey: ['ingredient', id],
    queryFn: () => api.getIngredientById(id),
    enabled: !!id,
  });
}

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (ingredient: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'>) =>
      api.createIngredient(ingredient, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, updates, reason = 'Updated Master Config' }: { id: string; updates: Partial<Ingredient>; reason?: string }) =>
      api.updateIngredient(id, updates, reason, user?.id || 'usr-owner-001'),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['ingredient', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useDeactivateIngredient() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.deactivateIngredient(id, reason, user?.id || 'usr-owner-001'),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['ingredient', variables.id] });
    },
  });
}

export function useReactivateIngredient() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (id: string) =>
      api.reactivateIngredient(id, user?.id || 'usr-owner-001'),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['ingredient', variables] });
    },
  });
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.deleteIngredient(id, reason, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

// --- Raw Material Ledger Balances & KPIs ---
export function useRawMaterialBalances() {
  return useQuery({
    queryKey: ['raw-material-balances'],
    queryFn: () => api.getRawMaterialBalances(),
  });
}

export function useRawMaterialMovements(ingredientId?: string) {
  return useQuery({
    queryKey: ['raw-material-movements', ingredientId],
    queryFn: () => api.getRawMaterialMovements(ingredientId),
  });
}

export function useRawMaterialDashboardKPIs() {
  return useQuery({
    queryKey: ['raw-material-kpis'],
    queryFn: () => api.getRawMaterialDashboardKPIs(),
    refetchInterval: 30000,
  });
}

// --- Material Purchases ---
export function useMaterialPurchases() {
  return useQuery({
    queryKey: ['material-purchases'],
    queryFn: () => api.getMaterialPurchases(),
  });
}

export function useMaterialPurchase(id: string) {
  return useQuery({
    queryKey: ['material-purchase', id],
    queryFn: () => api.getMaterialPurchaseById(id),
    enabled: !!id,
  });
}

export function useCreateMaterialPurchase() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      purchase_date: string;
      supplier_id?: string | null;
      invoice_number?: string | null;
      payment_method: 'cash' | 'upi' | 'bank_transfer' | 'credit';
      paid_amount: number;
      credit_amount?: number;
      bill_image_url?: string | null;
      notes?: string | null;
      items: {
        ingredient_id: string;
        purchased_quantity: number;
        purchase_unit: UnitType;
        free_quantity?: number;
        unit_price: number;
        discount?: number;
        tax?: number;
        allocated_charge?: number;
        lot_number?: string | null;
        manufacturing_date?: string | null;
        expiry_date?: string | null;
      }[];
    }) => api.createMaterialPurchase(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-movements'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['reorder-list'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useReverseMaterialPurchase() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ purchaseId, reason }: { purchaseId: string; reason: string }) =>
      api.reverseMaterialPurchase(purchaseId, reason, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-movements'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

// --- Physical Stock Counts ---
export function usePhysicalStockCounts() {
  return useQuery({
    queryKey: ['physical-stock-counts'],
    queryFn: () => api.getPhysicalStockCounts(),
  });
}

export function useCreatePhysicalStockCount() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      count_date: string;
      notes?: string;
      items: {
        ingredient_id: string;
        physical_stock: number;
        reason?: string;
      }[];
      status?: 'draft' | 'approved';
    }) => api.createPhysicalStockCount(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['physical-stock-counts'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-movements'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useApprovePhysicalStockCount() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (countId: string) =>
      api.approvePhysicalStockCount(countId, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['physical-stock-counts'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-movements'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

// --- Wastage & Damage ---
export function useInventoryWastages() {
  return useQuery({
    queryKey: ['inventory-wastages'],
    queryFn: () => api.getInventoryWastages(),
  });
}

export function useRecordInventoryWastage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      wastage_date: string;
      ingredient_id: string;
      lot_id?: string | null;
      quantity: number;
      unit: UnitType;
      wastage_type: InventoryWastage['wastage_type'];
      reason: string;
      photo_url?: string | null;
    }) => api.recordInventoryWastage(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-wastages'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-movements'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

// --- Supplier Returns ---
export function useSupplierReturns() {
  return useQuery({
    queryKey: ['supplier-returns'],
    queryFn: () => api.getSupplierReturns(),
  });
}

export function useCreateSupplierReturn() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      return_date: string;
      supplier_id?: string | null;
      purchase_id?: string | null;
      ingredient_id: string;
      lot_id?: string | null;
      returned_quantity: number;
      unit: UnitType;
      reason: string;
      total_refund_amount: number;
    }) => api.createSupplierReturn(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-movements'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

// --- Reorder Shopping List ---
export function useReorderList() {
  return useQuery({
    queryKey: ['reorder-list'],
    queryFn: () => api.getReorderList(),
  });
}

export function useUpdateReorderItemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ingredientId, status, notes }: { ingredientId: string; status: 'needed' | 'ordered' | 'received'; notes?: string }) =>
      api.updateReorderItemStatus(ingredientId, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reorder-list'] });
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
    },
  });
}
