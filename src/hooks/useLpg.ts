import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  SimpleLpgCylinderStatus,
  SimpleLpgMovementType,
} from '@/types';
import { useAuth } from '@/context/AuthContext';

export function useSimpleLpgCylinders(includeInactive: boolean = true) {
  return useQuery({
    queryKey: ['simple-lpg-cylinders', includeInactive],
    queryFn: () => api.getSimpleLpgCylinders(includeInactive),
  });
}

export function useSimpleLpgCylinder(id: string) {
  return useQuery({
    queryKey: ['simple-lpg-cylinder', id],
    queryFn: () => api.getSimpleLpgCylinderById(id),
    enabled: !!id,
  });
}

export function useSimpleLpgMovements(cylinderId?: string) {
  return useQuery({
    queryKey: ['simple-lpg-movements', cylinderId],
    queryFn: () => api.getSimpleLpgMovements(cylinderId),
  });
}

export function useLpgSummaryKPIs() {
  return useQuery({
    queryKey: ['lpg-summary-kpis'],
    queryFn: () => api.getLpgSummaryKPIs(),
  });
}

export function useAddSimpleLpgCylinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      cylinder_code: string;
      status?: SimpleLpgCylinderStatus;
      supplier_id?: string | null;
      supplier_name?: string | null;
      starting_date?: string;
      notes?: string | null;
      idempotency_key?: string;
    }) => api.addSimpleLpgCylinder(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-movements'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-summary-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useRecordSimpleLpgMovement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      cylinder_id: string;
      movement_type: SimpleLpgMovementType;
      movement_date?: string;
      movement_time?: string | null;
      bhatti_place?: string | null;
      supplier_name?: string | null;
      bill_number?: string | null;
      notes?: string | null;
      idempotency_key?: string;
    }) => api.recordSimpleLpgMovement(data, user?.id || 'usr-owner-001'),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-cylinder', variables.cylinder_id] });
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-movements'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-summary-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useCorrectSimpleLpgMovement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      movement_id: string;
      reason: string;
      corrected_movement_type?: SimpleLpgMovementType;
      corrected_date?: string;
      corrected_time?: string;
      corrected_bhatti_place?: string;
      corrected_supplier_name?: string;
      corrected_bill_number?: string;
      corrected_notes?: string;
      idempotency_key?: string;
    }) => api.correctSimpleLpgMovement(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-movements'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-summary-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useDeleteOrArchiveSimpleLpgCylinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      cylinder_id: string;
      reason: string;
    }) => api.deleteOrArchiveSimpleLpgCylinder(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-movements'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-summary-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useReactivateSimpleLpgCylinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      cylinder_id: string;
      reason?: string;
    }) => api.reactivateSimpleLpgCylinder(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['simple-lpg-movements'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-summary-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

// --- Backward Compatibility Wrappers ---
export const useLpgCylinders = useSimpleLpgCylinders;
export const useLpgCylinder = useSimpleLpgCylinder;
export const useCreateLpgCylinder = useAddSimpleLpgCylinder;
export const useConnectLpgCylinder = () => {
  const mutation = useRecordSimpleLpgMovement();
  return {
    ...mutation,
    mutateAsync: (cylinderId: string) =>
      mutation.mutateAsync({ cylinder_id: cylinderId, movement_type: 'connected' }),
  };
};
export const useDeleteLpgCylinder = () => {
  const mutation = useDeleteOrArchiveSimpleLpgCylinder();
  return {
    ...mutation,
    mutateAsync: (cylinderId: string) =>
      mutation.mutateAsync({ cylinder_id: cylinderId, reason: 'Owner deleted' }),
  };
};
export const useLpgReadings = (cylinderId?: string) => useSimpleLpgMovements(cylinderId);
export const useRecordLpgReading = () => ({
  mutateAsync: async () => {},
  isPending: false,
});
export const useRecordLpgRefill = () => {
  const mutation = useRecordSimpleLpgMovement();
  return {
    ...mutation,
    mutateAsync: ({ cylinderId, refillCost }: { cylinderId: string; refillCost: number }) =>
      mutation.mutateAsync({
        cylinder_id: cylinderId,
        movement_type: 'refill_received',
        notes: `Refilled for ₹${refillCost}`,
      }),
  };
};

