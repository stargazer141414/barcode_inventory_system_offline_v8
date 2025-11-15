/**
 * IndexedDB Manager for Offline Data Storage
 * Stores scanned items locally when offline for later sync
 */

const DB_NAME = 'BarcodeInventoryDB';
const DB_VERSION = 1;
const STORES = {
  PENDING_SCANS: 'pendingScans',
  OFFLINE_INVENTORY: 'offlineInventory',
  SYNC_QUEUE: 'syncQueue'
};

export interface PendingScan {
  id: string;
  barcode: string;
  action: 'increment' | 'decrement';
  productData: {
    product: string;
    colour: string;
    size: string;
    zone?: string;
  };
  zone?: string;
  timestamp: number;
  synced: boolean;
}

export interface OfflineInventoryItem {
  barcode: string;
  product: string;
  colour: string | null;
  size: string | null;
  quantity: number;
  zone: string | null;
  lastModified: number;
}

class IndexedDBManager {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create pending scans store
        if (!db.objectStoreNames.contains(STORES.PENDING_SCANS)) {
          const pendingStore = db.createObjectStore(STORES.PENDING_SCANS, { keyPath: 'id' });
          pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
          pendingStore.createIndex('synced', 'synced', { unique: false });
        }

        // Create offline inventory store
        if (!db.objectStoreNames.contains(STORES.OFFLINE_INVENTORY)) {
          const inventoryStore = db.createObjectStore(STORES.OFFLINE_INVENTORY, { keyPath: 'barcode' });
          inventoryStore.createIndex('lastModified', 'lastModified', { unique: false });
        }

        // Create sync queue store
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // Pending Scans Operations
  async addPendingScan(scan: Omit<PendingScan, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    const id = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullScan: PendingScan = {
      ...scan,
      id,
      timestamp: Date.now(),
      synced: false
    };

    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.PENDING_SCANS, 'readwrite');
      const request = store.add(fullScan);
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingScans(): Promise<PendingScan[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.PENDING_SCANS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedScans(): Promise<PendingScan[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.PENDING_SCANS);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async markScanAsSynced(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.PENDING_SCANS, 'readwrite');
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const scan = getRequest.result;
        if (scan) {
          scan.synced = true;
          const updateRequest = store.put(scan);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deletePendingScan(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.PENDING_SCANS, 'readwrite');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearSyncedScans(): Promise<void> {
    const synced = await this.getPendingScans();
    const syncedScans = synced.filter(s => s.synced);
    
    for (const scan of syncedScans) {
      await this.deletePendingScan(scan.id);
    }
  }

  // Offline Inventory Operations
  async saveOfflineInventoryItem(item: OfflineInventoryItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.OFFLINE_INVENTORY, 'readwrite');
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getOfflineInventoryItem(barcode: string): Promise<OfflineInventoryItem | null> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.OFFLINE_INVENTORY);
      const request = store.get(barcode);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllOfflineInventory(): Promise<OfflineInventoryItem[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.OFFLINE_INVENTORY);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteOfflineInventoryItem(barcode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.OFFLINE_INVENTORY, 'readwrite');
      const request = store.delete(barcode);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearOfflineInventory(): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.OFFLINE_INVENTORY, 'readwrite');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get pending sync count
  async getPendingSyncCount(): Promise<number> {
    const unsynced = await getUnsyncedScans();
    return unsynced.length;
  }
}

// Singleton instance
let dbManager: IndexedDBManager | null = null;

export async function getDBManager(): Promise<IndexedDBManager> {
  if (!dbManager) {
    dbManager = new IndexedDBManager();
    await dbManager.init();
  }
  return dbManager;
}

// Export convenience functions
export async function addPendingScan(scan: Omit<PendingScan, 'id' | 'timestamp' | 'synced'>): Promise<string> {
  const db = await getDBManager();
  return db.addPendingScan(scan);
}

export async function getPendingScans(): Promise<PendingScan[]> {
  const db = await getDBManager();
  return db.getPendingScans();
}

export async function getUnsyncedScans(): Promise<PendingScan[]> {
  const db = await getDBManager();
  return db.getUnsyncedScans();
}

export async function markScanAsSynced(id: string): Promise<void> {
  const db = await getDBManager();
  return db.markScanAsSynced(id);
}

export async function saveOfflineInventoryItem(item: OfflineInventoryItem): Promise<void> {
  const db = await getDBManager();
  return db.saveOfflineInventoryItem(item);
}

export async function getOfflineInventoryItem(barcode: string): Promise<OfflineInventoryItem | null> {
  const db = await getDBManager();
  return db.getOfflineInventoryItem(barcode);
}

export async function clearSyncedScans(): Promise<void> {
  const db = await getDBManager();
  return db.clearSyncedScans();
}
