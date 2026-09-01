import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { backupService, ProgressCallback } from '@/lib/backupService';
import { useAuth } from '@/context/AuthContext';

export function useBackupHistory() {
  return useQuery({
    queryKey: ['backup_history'],
    queryFn: () => api.getBackupHistory(),
  });
}

export function useCreateCompleteBackup() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ onProgress }: { onProgress?: ProgressCallback } = {}) => {
      const userId = user?.id || 'usr-owner-001';
      return backupService.generateCompleteBackup(userId, onProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup_history'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
    },
  });
}

export function useCreateDateRangeBackup() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      startDate,
      endDate,
      onProgress,
    }: {
      startDate: string;
      endDate: string;
      onProgress?: ProgressCallback;
    }) => {
      const userId = user?.id || 'usr-owner-001';
      return backupService.generateDateRangeBackup(startDate, endDate, userId, onProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup_history'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
    },
  });
}

export function useCreateExpenseBillsBackup() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ onProgress }: { onProgress?: ProgressCallback } = {}) => {
      const userId = user?.id || 'usr-owner-001';
      return backupService.generateExpenseBillsBackup(userId, onProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup_history'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
    },
  });
}

export function useValidateBackup() {
  return useMutation({
    mutationFn: async (file: File) => {
      return backupService.validateBackupZip(file);
    },
  });
}

export function useExecuteRestore() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      file,
      passphrase,
      reason,
      isDryRun,
    }: {
      file: File;
      passphrase: string;
      reason: string;
      isDryRun?: boolean;
    }) => {
      const userId = user?.id || 'usr-owner-001';
      return backupService.executeControlledRestore(file, passphrase, reason, userId, isDryRun);
    },
    onSuccess: (_, variables) => {
      if (!variables.isDryRun) {
        queryClient.invalidateQueries();
      }
    },
  });
}
