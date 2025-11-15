import React from 'react';
import { WifiOff, Wifi, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useOffline } from '@/contexts/OfflineContext';

/**
 * Network Status Banner
 * Shows at the top of the page when offline or syncing
 */
export function NetworkStatusBanner() {
  const { 
    isOnline, 
    isSyncing, 
    pendingSyncCount, 
    syncProgress,
    triggerSync 
  } = useOffline();

  // Don't show banner if online and not syncing and no pending items
  if (isOnline && !isSyncing && pendingSyncCount === 0) {
    return null;
  }

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${
      !isOnline ? 'bg-orange-600' : 
      isSyncing ? 'bg-blue-600' : 
      'bg-green-600'
    } text-white shadow-lg`}>
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isOnline ? (
              <>
                <WifiOff className="w-5 h-5" />
                <div>
                  <p className="font-medium">Offline Mode</p>
                  <p className="text-sm opacity-90">
                    {pendingSyncCount > 0 
                      ? `${pendingSyncCount} item${pendingSyncCount > 1 ? 's' : ''} pending sync`
                      : 'Scans will be saved locally'}
                  </p>
                </div>
              </>
            ) : isSyncing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <div>
                  <p className="font-medium">Syncing...</p>
                  {syncProgress && (
                    <p className="text-sm opacity-90">
                      {syncProgress.current} of {syncProgress.total} items
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <Cloud className="w-5 h-5" />
                <div>
                  <p className="font-medium">Pending Sync</p>
                  <p className="text-sm opacity-90">
                    {pendingSyncCount} item{pendingSyncCount > 1 ? 's' : ''} waiting to sync
                  </p>
                </div>
              </>
            )}
          </div>

          {isOnline && !isSyncing && pendingSyncCount > 0 && (
            <button
              onClick={() => triggerSync()}
              className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Sync Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Network Status Indicator (for navigation bar)
 * Small indicator showing connection status
 */
export function NetworkStatusIndicator() {
  const { isOnline, pendingSyncCount } = useOffline();

  return (
    <div className="flex items-center gap-2">
      {isOnline ? (
        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
          <Wifi className="w-4 h-4" />
          <span className="text-xs font-medium">Online</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
          <WifiOff className="w-4 h-4" />
          <span className="text-xs font-medium">Offline</span>
        </div>
      )}
      
      {pendingSyncCount > 0 && (
        <div className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
          <CloudOff className="w-3 h-3" />
          <span className="font-medium">{pendingSyncCount}</span>
        </div>
      )}
    </div>
  );
}
