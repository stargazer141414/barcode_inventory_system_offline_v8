import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NetworkStatusIndicator } from '@/components/NetworkStatus';
import { supabase, InventoryItem } from '@/lib/supabase';
import { 
  Package, 
  Scan, 
  Settings, 
  LogOut, 
  Search, 
  Download,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Edit2,
  Trash2,
  Plus,
  Filter,
  X,
  MapPin,
  History,
  RefreshCw
} from 'lucide-react';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Show 50 items per page

  // Filter state
  const [productFilter, setProductFilter] = useState('');
  const [colourFilter, setColourFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      loadInventory();
      
      // Subscribe to real-time changes
      const subscription = supabase
        .channel('inventory_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
          filter: `user_id=eq.${user.id}`
        }, () => {
          console.log('Real-time update triggered, reloading inventory...');
          loadInventory();
        })
        .subscribe();

      // Also refresh after a short delay to ensure data is updated
      setTimeout(() => {
        console.log('Refreshing inventory after delay...');
        loadInventory();
      }, 2000);

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user, navigate]);

  useEffect(() => {
    let filtered = inventory.filter(item => {
      // Search filter
      const matchesSearch = !searchQuery || 
        item.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.colour?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.size?.toLowerCase().includes(searchQuery.toLowerCase());

      // Product filter (text input - partial match, case insensitive)
      const matchesProduct = !productFilter || 
        item.product.toLowerCase().includes(productFilter.toLowerCase());

      // Colour filter (text input - partial match, case insensitive)
      const matchesColour = !colourFilter || 
        (colourFilter.toLowerCase() === 'none' ? !item.colour : 
         item.colour?.toLowerCase().includes(colourFilter.toLowerCase()));

      // Size filter (text input - partial match, case insensitive)
      const matchesSize = !sizeFilter || 
        (sizeFilter.toLowerCase() === 'none' ? !item.size : 
         item.size?.toLowerCase().includes(sizeFilter.toLowerCase()));

      // Zone filter (text input - partial match, case insensitive)
      const matchesZone = !zoneFilter || 
        (zoneFilter.toLowerCase() === 'none' ? !item.zone : 
         item.zone?.toLowerCase().includes(zoneFilter.toLowerCase()));

      // Quantity filter (hide items with quantity = 0, but keep in database)
      const matchesQuantity = item.quantity > 0;

      return matchesSearch && matchesProduct && matchesColour && matchesSize && matchesZone && matchesQuantity;
    });
    
    setFilteredInventory(filtered);
    setCurrentPage(1); // Reset to first page when search/filters change
  }, [searchQuery, inventory, productFilter, colourFilter, sizeFilter, zoneFilter]);

  const loadInventory = async () => {
    try {
      // Fetch all records by setting a high range limit
      // This handles datasets of 10,000+ items
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*', { count: 'exact' })
        .eq('user_id', user?.id)
        .order('updated_at', { ascending: false })
        .range(0, 9999); // Fetch up to 10,000 records

      if (error) throw error;
      setInventory(data || []);
      
      // Log record count for monitoring
      console.log(`Loaded ${data?.length || 0} inventory items`);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  };


  const clearAllFilters = () => {
    setProductFilter('');
    setColourFilter('');
    setSizeFilter('');
    setZoneFilter('');
    setSearchQuery('');
  };

  const clearIndividualFilter = (filterType: string) => {
    switch (filterType) {
      case 'product':
        setProductFilter('');
        break;
      case 'colour':
        setColourFilter('');
        break;
      case 'size':
        setSizeFilter('');
        break;
      case 'zone':
        setZoneFilter('');
        break;
      case 'search':
        setSearchQuery('');
        break;
    }
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (productFilter) count++;
    if (colourFilter) count++;
    if (sizeFilter) count++;
    if (zoneFilter) count++;
    if (searchQuery) count++;
    return count;
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    const itemToDelete = inventory.find(item => item.id === id);

    try {
      // Try using sync-inventory edge function first
      const { data, error } = await supabase.functions.invoke('sync-inventory', {
        body: {
          action: 'delete',
          barcode: itemToDelete?.barcode,
          itemId: id
        }
      });

      if (error) {
        // If edge function fails, try direct delete as fallback
        console.warn('Edge function delete failed, trying direct delete:', error);
        
        const { error: deleteError } = await supabase
          .from('inventory_items')
          .delete()
          .eq('id', id);

        if (deleteError) throw deleteError;
      }
      

      
      loadInventory();
      alert('Item deleted successfully!');
    } catch (error: any) {
      console.error('Error deleting item:', error);
      alert(`Failed to delete item: ${error.message || 'Unknown error'}`);
    }
  };

  const handleClearAllData = async () => {
    if (!confirm('⚠️ WARNING: This will permanently delete ALL inventory data imported from CSV files. This action cannot be undone.\n\nAre you sure you want to proceed?')) return;

    try {
      setLoading(true);
      
      // Delete all inventory items for the current user
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('user_id', user?.id);

      if (error) {
        throw error;
      }

      // Also clear activity logs related to inventory
      const { error: logError } = await supabase
        .from('activity_logs')
        .delete()
        .eq('user_id', user?.id)
        .like('action', '%inventory%');

      if (logError) {
        console.warn('Warning: Could not clear activity logs:', logError);
      }

      // Reload inventory to reflect changes
      loadInventory();
      
      alert('✅ All inventory data has been cleared successfully!');
    } catch (error: any) {
      console.error('Error clearing all data:', error);
      alert(`Failed to clear data: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (item: InventoryItem) => {
    const oldItem = inventory.find(i => i.id === item.id);
    
    try {
      // Try using sync-inventory edge function first for consistency
      const { data, error } = await supabase.functions.invoke('sync-inventory', {
        body: {
          action: 'update',
          barcode: item.barcode,
          itemId: item.id,
          productData: {
            product: item.product,
            colour: item.colour || '',
            size: item.size || '',
            quantity: item.quantity,
            zone: item.zone || null,
            low_stock_threshold: item.low_stock_threshold
          }
        }
      });

      if (error) {
        // If edge function fails, try direct database update as fallback
        console.warn('Edge function update failed, trying direct update:', error);
        
        const { error: updateError } = await supabase
          .from('inventory_items')
          .update({
            product: item.product,
            colour: item.colour,
            size: item.size,
            quantity: item.quantity,
            zone: item.zone,
            low_stock_threshold: item.low_stock_threshold,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (updateError) throw updateError;
      }
      

      
      setEditingItem(null);
      loadInventory();
      
      // Show success message
      alert('Item updated successfully!');
    } catch (error: any) {
      console.error('Error updating item:', error);
      alert(`Failed to update item: ${error.message || 'Unknown error'}`);
    }
  };

  const totalItems = inventory.length;
  const totalQuantity = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockItems = inventory.filter(item => item.quantity <= item.low_stock_threshold).length;

  // Pagination calculations
  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredInventory.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Package className="w-8 h-8 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Marx Inventory App</h1>
            </div>
            <div className="flex items-center gap-4">
              <NetworkStatusIndicator />
              <button
                onClick={() => navigate('/scanner')}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Scan className="w-5 h-5" />
                <span>Quick Scan</span>
              </button>
              <button
                onClick={() => loadInventory()}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Refresh Inventory"
              >
                <RefreshCw className="w-6 h-6" />
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Settings className="w-6 h-6" />
              </button>
              <button
                onClick={() => navigate('/activity-logs')}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Activity Logs"
              >
                <History className="w-6 h-6" />
              </button>
              <ThemeToggle />
              <button
                onClick={handleSignOut}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <LogOut className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Items</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{totalItems}</p>
              </div>
              <div className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-full">
                <Package className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Quantity</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{totalQuantity}</p>
              </div>
              <div className="bg-green-100 dark:bg-green-900/50 p-3 rounded-full">
                <TrendingUp className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Low Stock Alerts</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{lowStockItems}</p>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900/50 p-3 rounded-full">
                <AlertTriangle className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-6 border-b dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inventory Items</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleClearAllData}
                  className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                  disabled={inventory.length === 0}
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>Clear All Data</span>
                </button>
                <button
                  onClick={() => navigate('/scanner')}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Item</span>
                </button>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="mb-4 space-y-4">
              {/* Filter Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Product Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Product</label>
                  <input
                    type="text"
                    placeholder="Type product name (e.g., PROFESSIONAL SHORT)"
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Colour Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Colour</label>
                  <input
                    type="text"
                    placeholder="Type colour name (or 'none' for items without colour)"
                    value={colourFilter}
                    onChange={(e) => setColourFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Size Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Size</label>
                  <input
                    type="text"
                    placeholder="Type size (or 'none' for items without size)"
                    value={sizeFilter}
                    onChange={(e) => setSizeFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Zone Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zone</label>
                  <input
                    type="text"
                    placeholder="Type zone (or 'none' for items without zone)"
                    value={zoneFilter}
                    onChange={(e) => setZoneFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Clear Filters */}
                <div className="flex items-end">
                  <button
                    onClick={clearAllFilters}
                    disabled={getActiveFiltersCount() === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Filter className="w-4 h-4" />
                    <span>Clear All ({getActiveFiltersCount()})</span>
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Search by barcode, product, colour, or size..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Active Filters Display */}
              {getActiveFiltersCount() > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Filters:</span>
                  
                  {searchQuery && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-full text-sm">
                      <span>Search: "{searchQuery}"</span>
                      <button
                        onClick={() => clearIndividualFilter('search')}
                        className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  
                  {productFilter && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded-full text-sm">
                      <span>Product: {productFilter}</span>
                      <button
                        onClick={() => clearIndividualFilter('product')}
                        className="hover:bg-green-200 dark:hover:bg-green-800 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  
                  {colourFilter && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 rounded-full text-sm">
                      <span>Colour: {colourFilter === 'none' ? 'No Colour' : colourFilter}</span>
                      <button
                        onClick={() => clearIndividualFilter('colour')}
                        className="hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  
                  {sizeFilter && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 rounded-full text-sm">
                      <span>Size: {sizeFilter === 'none' ? 'No Size' : sizeFilter}</span>
                      <button
                        onClick={() => clearIndividualFilter('size')}
                        className="hover:bg-orange-200 dark:hover:bg-orange-800 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {zoneFilter && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 rounded-full text-sm">
                      <span>Zone: {zoneFilter === 'none' ? 'No Zone' : zoneFilter}</span>
                      <button
                        onClick={() => clearIndividualFilter('zone')}
                        className="hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto min-w-full">
            <table className="min-w-full table-auto">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[120px]">Barcode</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[200px]">Product</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[100px]">Colour</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[80px]">Size</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[80px]">Zone</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[90px]">Quantity</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[100px]">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-gray-500 dark:text-gray-400">
                      {getActiveFiltersCount() > 0 ? 'No items found matching your filters' : 'No items with stock (quantity > 0). Zero quantity items are hidden for display.'}
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {editingItem?.id === item.id ? (
                        <>
                          <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.barcode}</td>
                          <td className="px-3 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={editingItem.product}
                              onChange={(e) => setEditingItem({ ...editingItem, product: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                            />
                          </td>
                          <td className="px-3 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={editingItem.colour || ''}
                              onChange={(e) => setEditingItem({ ...editingItem, colour: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                            />
                          </td>
                          <td className="px-3 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={editingItem.size || ''}
                              onChange={(e) => setEditingItem({ ...editingItem, size: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                            />
                          </td>
                          <td className="px-3 py-4 whitespace-nowrap">
                            <input
                              type="text"
                              value={editingItem.zone || ''}
                              onChange={(e) => setEditingItem({ ...editingItem, zone: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                              placeholder="Zone"
                            />
                          </td>
                          <td className="px-3 py-4 whitespace-nowrap">
                            <input
                              type="number"
                              value={editingItem.quantity}
                              onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })}
                              className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                            />
                          </td>
                          <td className="px-3 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleUpdate(editingItem)}
                              className="text-green-600 hover:text-green-700 mr-2 text-xs"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingItem(null)}
                              className="text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-xs"
                            >
                              Cancel
                            </button>
                          </td>
                          <td className="px-3 py-4 whitespace-nowrap"></td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{item.barcode}</td>
                          <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 truncate max-w-[200px]" title={item.product}>{item.product}</td>
                          <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.colour || '-'}</td>
                          <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.size || '-'}</td>
                          <td className="px-3 py-4 whitespace-nowrap text-sm">
                            {item.zone ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium text-xs">
                                <MapPin className="w-3 h-3" />
                                {item.zone}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                          <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium">{item.quantity}</td>
                          <td className="px-3 py-4 whitespace-nowrap">
                            {item.quantity <= item.low_stock_threshold ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300">
                                <AlertTriangle className="w-3 h-3" />
                                Low Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">
                                In Stock
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => setEditingItem(item)}
                              className="text-blue-600 hover:text-blue-700 mr-2 p-1 rounded transition-colors"
                              title="Edit Item"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="text-red-600 hover:text-red-700 p-1 rounded transition-colors"
                              title="Delete Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredInventory.length > 0 && (
            <div className="px-6 py-4 border-t dark:border-gray-700 flex items-center justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                <span className="font-medium">{Math.min(endIndex, filteredInventory.length)}</span> of{' '}
                <span className="font-medium">{filteredInventory.length}</span> items
                {getActiveFiltersCount() > 0 && ` (filtered from ${inventory.length} total)`}
                {getActiveFiltersCount() === 0 && filteredInventory.length < inventory.length && ` (${inventory.length - filteredInventory.length} zero quantity items hidden)`}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  First
                </button>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, idx) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = idx + 1;
                    } else if (currentPage <= 3) {
                      pageNum = idx + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + idx;
                    } else {
                      pageNum = currentPage - 2 + idx;
                    }
                    
                    return (
                      <button
                        key={idx}
                        onClick={() => goToPage(pageNum)}
                        className={`px-3 py-1 border rounded text-sm ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  Next
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
