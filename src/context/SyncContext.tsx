import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { OfflineDraft } from '@/types';
import {
  saveOfflineDraft,
  getPendingDrafts,
  getAllDrafts,
  updateDraftStatus,
  deleteOfflineDraft,
  cacheMasterData,
} from '@/lib/offlineDb';
import { api } from '@/lib/api';
import { generateId } from '@/lib/utils';

interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  drafts: OfflineDraft[];
  isSyncing: boolean;
  saveDraft: (type: OfflineDraft['type'], payload: any) => Promise<string>;
  syncNow: () => Promise<{ success: number; failed: number }>;
  deleteDraft: (id: string) => Promise<void>;
  retryDraft: (id: string) => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshDrafts = useCallback(async () => {
    try {
      const all = await getAllDrafts();
      setDrafts(all);
    } catch (e) {
      console.error('Failed to load drafts from IndexedDB', e);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    refreshDrafts();

    // Periodic master data caching for offline use
    const cacheData = async () => {
      try {
        const [products, sellers, carts] = await Promise.all([
          api.getProducts(),
          api.getSellers(),
          api.getCarts(),
        ]);
        await cacheMasterData(products, sellers, carts);
      } catch (err) {
        // quiet catch
      }
    };
    cacheData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshDrafts]);

  const saveDraft = async (type: OfflineDraft['type'], payload: any): Promise<string> => {
    const id = generateId();
    const draft: OfflineDraft = {
      id,
      type,
      payload,
      created_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
    };
    await saveOfflineDraft(draft);
    await refreshDrafts();
    return id;
  };

  const syncSingleDraft = async (draft: OfflineDraft, userId: string) => {
    await updateDraftStatus(draft.id, 'syncing');
    try {
      if (draft.type === 'production_batch') {
        const { production_date, total_ingredient_cost, notes, items } = draft.payload;
        await api.createProductionBatch(production_date, total_ingredient_cost, notes, items, userId);
      } else if (draft.type === 'seller_issue') {
        const { seller_id, cart_id, issue_date, items, notes } = draft.payload;
        await api.issueSellerStock(seller_id, cart_id, issue_date, items, notes, userId);
      } else if (draft.type === 'seller_settlement') {
        const { issue_id, settlement_date, items, cash, upi, credit, notes, is_approved } = draft.payload;
        await api.processSellerSettlement(issue_id, settlement_date, items, cash, upi, credit, notes, is_approved, userId);
      } else if (draft.type === 'expense') {
        await api.createExpense(draft.payload, userId);
      }
      await deleteOfflineDraft(draft.id);
      return true;
    } catch (err: any) {
      console.error('Error syncing draft:', err);
      await updateDraftStatus(draft.id, 'failed', err.message || 'Sync failed');
      return false;
    }
  };

  const syncNow = async () => {
    if (isSyncing) return { success: 0, failed: 0 };
    setIsSyncing(true);
    let success = 0;
    let failed = 0;

    try {
      const pending = await getPendingDrafts();
      const profile = await api.getProfile();
      const userId = profile?.id || 'usr-owner-001';

      for (const draft of pending) {
        const ok = await syncSingleDraft(draft, userId);
        if (ok) success++;
        else failed++;
      }
      await refreshDrafts();
    } finally {
      setIsSyncing(false);
    }

    return { success, failed };
  };

  const deleteDraft = async (id: string) => {
    await deleteOfflineDraft(id);
    await refreshDrafts();
  };

  const retryDraft = async (id: string) => {
    await updateDraftStatus(id, 'pending');
    await refreshDrafts();
    await syncNow();
  };

  const pendingCount = drafts.filter((d) => d.status === 'pending' || d.status === 'failed').length;

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        pendingCount,
        drafts,
        isSyncing,
        saveDraft,
        syncNow,
        deleteDraft,
        retryDraft,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = (): SyncContextType => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
