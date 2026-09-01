import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { OfflineDraft } from '@/types';

interface JankiDB extends DBSchema {
  drafts: {
    key: string;
    value: OfflineDraft;
    indexes: { 'by-status': string; 'by-type': string };
  };
  cached_products: {
    key: string;
    value: any;
  };
  cached_sellers: {
    key: string;
    value: any;
  };
  cached_carts: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'janki_kulfi_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<JankiDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<JankiDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('drafts')) {
          const draftStore = db.createObjectStore('drafts', { keyPath: 'id' });
          draftStore.createIndex('by-status', 'status');
          draftStore.createIndex('by-type', 'type');
        }
        if (!db.objectStoreNames.contains('cached_products')) {
          db.createObjectStore('cached_products', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_sellers')) {
          db.createObjectStore('cached_sellers', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_carts')) {
          db.createObjectStore('cached_carts', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveOfflineDraft(draft: OfflineDraft): Promise<void> {
  const db = await getDB();
  await db.put('drafts', draft);
}

export async function getPendingDrafts(): Promise<OfflineDraft[]> {
  const db = await getDB();
  return db.getAllFromIndex('drafts', 'by-status', 'pending');
}

export async function getAllDrafts(): Promise<OfflineDraft[]> {
  const db = await getDB();
  return db.getAll('drafts');
}

export async function updateDraftStatus(
  id: string,
  status: OfflineDraft['status'],
  errorMessage?: string
): Promise<void> {
  const db = await getDB();
  const draft = await db.get('drafts', id);
  if (draft) {
    draft.status = status;
    if (errorMessage) draft.error_message = errorMessage;
    if (status === 'failed') draft.retry_count = (draft.retry_count || 0) + 1;
    await db.put('drafts', draft);
  }
}

export async function deleteOfflineDraft(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('drafts', id);
}

// Reference Data Caching for Offline Mode
export async function cacheMasterData(products: any[], sellers: any[], carts: any[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['cached_products', 'cached_sellers', 'cached_carts'], 'readwrite');
  
  if (products && products.length > 0) {
    await tx.objectStore('cached_products').clear();
    for (const p of products) {
      await tx.objectStore('cached_products').put(p);
    }
  }
  if (sellers && sellers.length > 0) {
    await tx.objectStore('cached_sellers').clear();
    for (const s of sellers) {
      await tx.objectStore('cached_sellers').put(s);
    }
  }
  if (carts && carts.length > 0) {
    await tx.objectStore('cached_carts').clear();
    for (const c of carts) {
      await tx.objectStore('cached_carts').put(c);
    }
  }
  await tx.done;
}

export async function getCachedMasterData(): Promise<{ products: any[]; sellers: any[]; carts: any[] }> {
  const db = await getDB();
  const products = await db.getAll('cached_products');
  const sellers = await db.getAll('cached_sellers');
  const carts = await db.getAll('cached_carts');
  return { products, sellers, carts };
}
