import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';
import {
  addPendingScan,
  getUnsyncedScans,
  markScanAsSynced,
  saveOfflineInventoryItem,
  getOfflineInventoryItem,
  clearSyncedScans,
  PendingScan,
  OfflineInventoryItem
} from '@/lib/indexedDB';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;
  syncProgress: { current: number; total: number } | null;
  lastSyncTime: Date | null;
  syncError: string | null;
  addOfflineScan: (scan: Omit<PendingScan, 'id' | 'timestamp' | 'synced'>) => Promise<void>;
  triggerSync: () => Promise<void>;
  getLocalInventoryItem: (barcode: string) => Promise<OfflineInventoryItem | null>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    try {
      const unsynced = await getUnsyncedScans();
      setPendingSyncCount(unsynced.length);
    } catch (error) {
      console.error('Error updating pending count:', error);
    }
  }, []);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-trigger sync when coming back online
      if (user && pendingSyncCount > 0) {
        triggerSync();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, pendingSyncCount]);

  // Update pending count on mount and when user changes
  useEffect(() => {
    if (user) {
      updatePendingCount();
      // Check for pending items every 30 seconds
      const interval = setInterval(updatePendingCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user, updatePendingCount]);

  // Add offline scan to queue
  const addOfflineScan = useCallback(async (scan: Omit<PendingScan, 'id' | 'timestamp' | 'synced'>) => {
    try {
      await addPendingScan(scan);
      
      // Update local inventory cache
      const existingItem = await getOfflineInventoryItem(scan.barcode);
      
      if (existingItem) {
        const newQuantity = scan.action === 'increment' 
          ? existingItem.quantity + 1 
          : Math.max(0, existingItem.quantity - 1);
        
        await saveOfflineInventoryItem({
          ...existingItem,
          quantity: newQuantity,
          lastModified: Date.now()
        });
      } else {
        // Create new offline item
        await saveOfflineInventoryItem({
          barcode: scan.barcode,
          product: scan.productData.product,
          colour: scan.productData.colour || null,
          size: scan.productData.size || null,
          quantity: 1,
          zone: scan.zone || null,
          lastModified: Date.now()
        });
      }
      
      await updatePendingCount();
    } catch (error) {
      console.error('Error adding offline scan:', error);
      throw error;
    }
  }, [updatePendingCount]);

  // Get local inventory item
  const getLocalInventoryItem = useCallback(async (barcode: string): Promise<OfflineInventoryItem | null> => {
    try {
      return await getOfflineInventoryItem(barcode);
    } catch (error) {
      console.error('Error getting local inventory item:', error);
      return null;
    }
  }, []);

  // Sync pending scans to server
  const triggerSync = useCallback(async () => {
    if (!user || !isOnline || isSyncing) {
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    setSyncProgress(null);

    try {
      const pendingScans = await getUnsyncedScans();
      
      if (pendingScans.length === 0) {
        setIsSyncing(false);
        return;
      }

      setSyncProgress({ current: 0, total: pendingScans.length });

      let successCount = 0;
      let errorCount = 0;

      // Sync each scan
      for (let i = 0; i < pendingScans.length; i++) {
        const scan = pendingScans[i];
        
        try {
          // Call edge function to sync this scan
          const requestBody: any = {
            action: scan.action,
            barcode: scan.barcode,
            productData: scan.productData
          };

          if (scan.zone) {
            requestBody.zone = scan.zone;
            requestBody.productData.zone = scan.zone;
          }

          const { error } = await supabase.functions.invoke('sync-inventory', {
            body: requestBody
          });

          if (error) {
            throw error;
          }

          // Mark as synced
          await markScanAsSynced(scan.id);
          successCount++;
        } catch (error) {
          console.error(`Error syncing scan ${scan.id}:`, error);
          errorCount++;
        }

        setSyncProgress({ current: i + 1, total: pendingScans.length });
      }

      // Clean up synced scans
      await clearSyncedScans();

      // Update counts
      await updatePendingCount();
      setLastSyncTime(new Date());

      if (errorCount > 0) {
        setSyncError(`Synced ${successCount} items, ${errorCount} failed`);
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      setSyncError(error.message || 'Failed to sync data');
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [user, isOnline, isSyncing, updatePendingCount]);

  const value: OfflineContextType = {
    isOnline,
    isSyncing,
    pendingSyncCount,
    syncProgress,
    lastSyncTime,
    syncError,
    addOfflineScan,
    triggerSync,
    getLocalInventoryItem
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
