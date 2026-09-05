import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LpgCylinder } from '@/types';
import { useAuth } from '@/context/AuthContext';

export function useLpgCylinders() {
  return useQuery({
    queryKey: ['lpg-cylinders'],
    queryFn: () => api.getLpgCylinders(),
  });
}

export function useLpgCylinder(id: string) {
  return useQuery({
    queryKey: ['lpg-cylinder', id],
    queryFn: () => api.getLpgCylinderById(id),
    enabled: !!id,
  });
}

export function useLpgReadings(cylinderId?: string) {
  return useQuery({
    queryKey: ['lpg-readings', cylinderId],
    queryFn: () => api.getLpgReadings(cylinderId),
  });
}

export function useCreateLpgCylinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: Omit<LpgCylinder, 'id' | 'calculated_remaining_gas' | 'remaining_percentage' | 'created_at' | 'updated_at'>) =>
      api.createLpgCylinder(data, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useRecordLpgReading() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({
      cylinderId,
      grossWeight,
      readingType = 'weighed',
      batchId,
      notes,
    }: {
      cylinderId: string;
      grossWeight: number;
      readingType?: 'weighed' | 'estimated_batch_use' | 'refill_in' | 'empty_out';
      batchId?: string;
      notes?: string;
    }) =>
      api.recordLpgReading(cylinderId, grossWeight, readingType, batchId, notes, user?.id || 'usr-owner-001'),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinder', variables.cylinderId] });
      queryClient.invalidateQueries({ queryKey: ['lpg-readings'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useRecordLpgRefill() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({
      cylinderId,
      refillCost,
      fullGrossWeight,
    }: {
      cylinderId: string;
      refillCost: number;
      fullGrossWeight?: number;
    }) =>
      api.recordLpgRefill(cylinderId, refillCost, fullGrossWeight, user?.id || 'usr-owner-001'),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinder', variables.cylinderId] });
      queryClient.invalidateQueries({ queryKey: ['lpg-readings'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useConnectLpgCylinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (cylinderId: string) =>
      api.connectLpgCylinder(cylinderId, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

export function useDeleteLpgCylinder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (cylinderId: string) =>
      api.deleteLpgCylinder(cylinderId, user?.id || 'usr-owner-001'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lpg-cylinders'] });
      queryClient.invalidateQueries({ queryKey: ['lpg-readings'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-kpis'] });
    },
  });
}

