import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NetworkStatusIndicator } from '@/components/NetworkStatus';
import { supabase } from '@/lib/supabase';
import { Scan, ArrowLeft, Plus, Minus, CheckCircle2, AlertCircle, Package, Keyboard, CloudOff } from 'lucide-react';

export default function Scanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { 
    isOnline, 
    addOfflineScan, 
    getLocalInventoryItem,
    pendingSyncCount 
  } = useOffline();
  
  const [barcodeInput, setBarcodeInput] = useState('');
  const [zoneInput, setZoneInput] = useState('');
  const [lastScannedItem, setLastScannedItem] = useState<any>(null);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    // Keep focus on input for scanner
    if (inputRef.current && !isProcessing) {
      inputRef.current.focus();
    }
  }, [isProcessing, lastScannedItem]);

  const handleBarcodeSubmit = async (barcode: string, zone?: string) => {
    if (!barcode.trim() || isProcessing) return;

    setIsProcessing(true);
    setScanMessage(null);

    try {
      const requestBody: any = {
        action: 'increment',
        barcode: barcode.trim(),
        productData: {
          product: `Product-${barcode.trim()}`,
          colour: '',
          size: ''
        }
      };

      // Add zone if provided
      if (zoneInput && zoneInput.trim()) {
        requestBody.zone = zoneInput.trim();
        requestBody.productData.zone = zoneInput.trim();
      }

      // Check if we're online
      if (!isOnline) {
        // OFFLINE MODE: Save to IndexedDB
        await addOfflineScan({
          barcode: barcode.trim(),
          action: 'increment',
          productData: requestBody.productData,
          zone: requestBody.zone
        });

        // Get updated local item
        const localItem = await getLocalInventoryItem(barcode.trim());
        
        if (localItem) {
          setLastScannedItem({
            barcode: localItem.barcode,
            product: localItem.product,
            colour: localItem.colour,
            size: localItem.size,
            quantity: localItem.quantity,
            zone: localItem.zone,
            isNewItem: localItem.quantity === 1
          });

          setScanMessage({
            type: 'info',
            text: `Saved offline: ${localItem.product} (Quantity: ${localItem.quantity})${localItem.zone ? ` - Zone: ${localItem.zone}` : ''}`
          });
        }
      } else {
        // ONLINE MODE: Call edge function directly
        const { data, error } = await supabase.functions.invoke('sync-inventory', {
          body: requestBody
        });

        if (error) {
          throw error;
        }

        // Handle response structure
        const item = data?.data || data;
        
        setLastScannedItem(item);
        
        setScanMessage({
          type: 'success',
          text: `${item.isNewItem ? 'New item created' : 'Updated'}: ${item.product} (Quantity: ${item.quantity})${item.zone ? ` - Zone: ${item.zone}` : ''}`
        });
      }

      // Auto-clear message after 3 seconds
      setTimeout(() => setScanMessage(null), 3000);

    } catch (error: any) {
      setScanMessage({
        type: 'error',
        text: error.message || 'Failed to process barcode'
      });
    } finally {
      setIsProcessing(false);
      setBarcodeInput('');
    }
  };

  const handleInputChange = (value: string) => {
    setBarcodeInput(value);

    // Clear existing timeout
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    // Auto-submit after 100ms of no input (scanner completes quickly)
    scanTimeoutRef.current = setTimeout(() => {
      if (value.trim()) {
        handleBarcodeSubmit(value);
      }
    }, 100);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    handleBarcodeSubmit(barcodeInput);
  };

  const handleQuantityChange = async (action: 'increment' | 'decrement') => {
    if (!lastScannedItem || isProcessing) return;

    setIsProcessing(true);

    try {
      const requestBody: any = {
        action,
        barcode: lastScannedItem.barcode,
        productData: {
          product: lastScannedItem.product,
          colour: lastScannedItem.colour || '',
          size: lastScannedItem.size || ''
        }
      };

      // Add zone if provided
      if (zoneInput && zoneInput.trim()) {
        requestBody.zone = zoneInput.trim();
        requestBody.productData.zone = zoneInput.trim();
      }

      if (!isOnline) {
        // OFFLINE MODE
        await addOfflineScan({
          barcode: lastScannedItem.barcode,
          action,
          productData: requestBody.productData,
          zone: requestBody.zone
        });

        const localItem = await getLocalInventoryItem(lastScannedItem.barcode);
        
        if (localItem) {
          setLastScannedItem({
            ...lastScannedItem,
            quantity: localItem.quantity
          });
          
          setScanMessage({
            type: 'info',
            text: `Saved offline: Quantity ${localItem.quantity}`
          });
        }
      } else {
        // ONLINE MODE
        const { data, error } = await supabase.functions.invoke('sync-inventory', {
          body: requestBody
        });

        if (error) {
          throw error;
        }

        const item = data?.data || data;
        setLastScannedItem(item);
        
        setScanMessage({
          type: 'success',
          text: `Updated quantity to ${item.quantity}`
        });
      }

      setTimeout(() => setScanMessage(null), 2000);

    } catch (error: any) {
      setScanMessage({
        type: 'error',
        text: error.message || 'Failed to update quantity'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
            <div className="flex items-center gap-4">
              <NetworkStatusIndicator />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-full mb-4">
            <Scan className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Quick Scan</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Scan a barcode to add or update inventory {!isOnline && '(Offline Mode)'}
          </p>
        </div>

        {/* Offline Mode Alert */}
        {!isOnline && (
          <div className="bg-orange-50 dark:bg-orange-900/50 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <CloudOff className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-orange-900 dark:text-orange-300 mb-1">
                  Offline Mode Active
                </h3>
                <p className="text-sm text-orange-800 dark:text-orange-400">
                  You can continue scanning. All items will be saved locally and automatically synced when connection is restored.
                  {pendingSyncCount > 0 && ` (${pendingSyncCount} items pending sync)`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scanner Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Keyboard className="w-6 h-6 text-blue-600" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Scanner Mode: Tera Scanner</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your barcode scanner is ready. Position the barcode and scan, or type manually and press Enter.
          </p>
        </div>

        {scanMessage && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            scanMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' :
            scanMessage.type === 'error' ? 'bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300' :
            'bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
          }`}>
            {scanMessage.type === 'success' ? <CheckCircle2 className="w-6 h-6 flex-shrink-0" /> :
             scanMessage.type === 'error' ? <AlertCircle className="w-6 h-6 flex-shrink-0" /> :
             <Package className="w-6 h-6 flex-shrink-0" />}
            <span className="font-medium">{scanMessage.text}</span>
          </div>
        )}

        {/* Zone Assignment */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <label htmlFor="zone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Zone Assignment (Optional)
          </label>
          <input
            id="zone"
            type="text"
            value={zoneInput}
            onChange={(e) => setZoneInput(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="e.g., A1, Zone 3, Cold Storage, Warehouse-A/Level-2"
          />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Assign scanned items to a warehouse zone for better organization
          </p>
        </div>

        {/* Keyboard Scanner Input */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 mb-6">
          <form onSubmit={handleManualSubmit}>
            <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Barcode Input
            </label>
            <div className="flex gap-3">
              <input
                ref={inputRef}
                id="barcode"
                type="text"
                value={barcodeInput}
                onChange={(e) => handleInputChange(e.target.value)}
                disabled={isProcessing}
                className="flex-1 px-6 py-4 text-2xl border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Scan or type barcode..."
                autoComplete="off"
                autoFocus
              />
              <button
                type="submit"
                disabled={isProcessing || !barcodeInput.trim()}
                className="px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isProcessing ? 'Processing...' : 'Submit'}
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Tera scanner ready. Position the barcode and scan, or type manually and press Enter.
            </p>
          </form>
        </div>

        {lastScannedItem && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Last Scanned Item</h2>
            
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Barcode</p>
                  <p className="text-lg font-mono font-medium text-gray-900 dark:text-gray-100">{lastScannedItem.barcode}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Product</p>
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{lastScannedItem.product}</p>
                </div>
                {lastScannedItem.colour && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Colour</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{lastScannedItem.colour}</p>
                  </div>
                )}
                {lastScannedItem.size && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Size</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{lastScannedItem.size}</p>
                  </div>
                )}
                {lastScannedItem.zone && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Zone</p>
                    <p className="text-lg font-medium text-blue-600 dark:text-blue-400">{lastScannedItem.zone}</p>
                  </div>
                )}
              </div>

              <div className="border-t dark:border-gray-700 pt-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Current Quantity</p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleQuantityChange('decrement')}
                    disabled={isProcessing || lastScannedItem.quantity <= 0}
                    className="p-3 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-6 h-6" />
                  </button>
                  
                  <div className="flex-1 text-center">
                    <p className="text-4xl font-bold text-gray-900 dark:text-gray-100">{lastScannedItem.quantity}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">units in stock</p>
                  </div>
                  
                  <button
                    onClick={() => handleQuantityChange('increment')}
                    disabled={isProcessing}
                    className="p-3 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {lastScannedItem.quantity <= lastScannedItem.low_stock_threshold && (
                <div className="bg-orange-50 dark:bg-orange-900/50 border border-orange-200 dark:border-orange-800 rounded-lg p-4 flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-800 dark:text-orange-300">Low Stock Alert</p>
                    <p className="text-sm text-orange-700 dark:text-orange-400">This item is below the low stock threshold</p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
            >
              View Full Inventory
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
