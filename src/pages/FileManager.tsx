import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, 
  FileText, 
  X, 
  Upload, 
  Download,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Eye,
  Calendar,
  Database,
  Archive
} from 'lucide-react';

interface UploadedFile {
  id: string;
  file: File;
  previewData?: {
    headers: string[];
    rows: string[][];
    errors: { line: number; error: string }[];
  };
  importResult?: {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
  };
  status: 'pending' | 'preview' | 'importing' | 'completed' | 'error';
  uploadedAt: Date;
}

interface ImportHistory {
  id: string;
  action_type: string;
  details: any;
  created_at: string;
  user_email: string;
}

export default function FileManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentFiles, setCurrentFiles] = useState<UploadedFile[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'current' | 'history'>('current');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      loadImportHistory();
      // Set up real-time subscription for import activities
      const subscription = supabase
        .channel('import_activities')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'user_activity_logs',
          filter: `user_id=eq.${user.id}`
        }, () => {
          loadImportHistory();
        })
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user, navigate]);

  const loadImportHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('user_activity_logs')
        .select('*')
        .eq('user_id', user?.id)
        .or('action_type.like.%import%,action_type.like.%csv%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setImportHistory(data || []);
    } catch (error) {
      console.error('Error loading import history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (files: FileList) => {
    if (files.length === 0) return;
    
    const file = files[0]; // Only take the first file
    
    if (!file.name.endsWith('.csv')) {
      alert(`File "${file.name}" is not a CSV file`);
      return;
    }

    const newFile: UploadedFile = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file: file,
      status: 'pending',
      uploadedAt: new Date()
    };

    // Clear existing files and add the new one (single file only)
    setCurrentFiles([newFile]);

    // Read and preview file
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const previewData = parseCSVPreview(text);
      
      setCurrentFiles([{ ...newFile, previewData, status: 'preview' }]);
    };
    reader.readAsText(file);
  };

  const parseCSVPreview = (csvText: string) => {
    const lines = csvText.trim().split('\n');
    
    if (lines.length < 2) {
      alert('CSV file must contain headers and at least one data row');
      return null;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const requiredFields = ['product_name', 'barcode', 'colour', 'size'];
    const missingFields = requiredFields.filter(field => 
      !headers.some(h => h.toLowerCase() === field)
    );

    const errors: { line: number; error: string }[] = [];
    
    if (missingFields.length > 0) {
      errors.push({
        line: 1,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const rows = lines.slice(1, 11).map((line, idx) => {
      const values = [];
      let currentValue = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim());

      if (values.length !== headers.length) {
        errors.push({
          line: idx + 2,
          error: `Expected ${headers.length} columns, found ${values.length}`
        });
      }

      return values.map(v => v.replace(/"/g, ''));
    });

    return { headers, rows, errors };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  const removeCurrentFile = (fileId: string) => {
    setCurrentFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const clearAllFiles = () => {
    setCurrentFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'importing':
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400`;
      case 'error':
        return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400`;
      case 'importing':
        return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400`;
      case 'preview':
        return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-400`;
      default:
        return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400`;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading file manager...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">File Manager</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your imported CSV files and view import history</p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-6">
          <div className="border-b dark:border-gray-700">
            <nav className="flex">
              <button
                onClick={() => setSelectedTab('current')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                  selectedTab === 'current'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Current Files ({currentFiles.length})
                </div>
              </button>
              <button
                onClick={() => setSelectedTab('history')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                  selectedTab === 'history'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  Import History ({importHistory.length})
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* Current Files Tab */}
        {selectedTab === 'current' && (
          <div className="space-y-6">
            {/* Upload Area */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                  <Upload className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Upload CSV File</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Drag and drop a CSV file or click to browse</p>
                </div>
              </div>

              {currentFiles.length === 0 ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    Drag and drop your CSV file here
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) handleFileUpload(files);
                    }}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label
                    htmlFor="csv-upload"
                    className="inline-block bg-blue-600 dark:bg-blue-700 text-white py-2 px-4 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors cursor-pointer"
                  >
                    Choose File
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      Current File
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate('/settings')}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Go to Settings
                      </button>
                      <button
                        onClick={clearAllFiles}
                        className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      >
                        Clear File
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {currentFiles.map((uploadedFile) => (
                      <div key={uploadedFile.id} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white text-sm">
                                {uploadedFile.file.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {(uploadedFile.file.size / 1024).toFixed(2)} KB • 
                                Uploaded {formatDate(uploadedFile.uploadedAt.toISOString())}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              {getStatusIcon(uploadedFile.status)}
                              <span className={getStatusBadge(uploadedFile.status)}>
                                {uploadedFile.status === 'completed' ? 'Completed' :
                                 uploadedFile.status === 'error' ? 'Error' :
                                 uploadedFile.status === 'importing' ? 'Importing...' :
                                 uploadedFile.status === 'preview' ? 'Ready' :
                                 'Pending'}
                              </span>
                            </div>
                            
                            <button
                              onClick={() => removeCurrentFile(uploadedFile.id)}
                              className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                              title="Remove file"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {uploadedFile.previewData && (
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                              Preview: {uploadedFile.previewData.rows.length} rows
                            </div>
                            
                            {uploadedFile.previewData.errors.length > 0 && (
                              <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                                {uploadedFile.previewData.errors.length} validation errors
                              </div>
                            )}

                            {uploadedFile.importResult && (
                              <div className="text-xs text-green-600 dark:text-green-400">
                                Imported: {uploadedFile.importResult.total} items 
                                ({uploadedFile.importResult.inserted} new, {uploadedFile.importResult.updated} updated, {uploadedFile.importResult.skipped} skipped)
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import History Tab */}
        {selectedTab === 'history' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="p-6 border-b dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import History</h2>
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-gray-500" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {importHistory.length} import activities
                  </span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {importHistory.length === 0 ? (
                <div className="p-12 text-center">
                  <Archive className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-500 dark:text-gray-400">No import history found</p>
                </div>
              ) : (
                importHistory.map((activity) => (
                  <div key={activity.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
                          <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {activity.action_type.replace(/_/g, ' ').toUpperCase()}
                            </h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              activity.action_type.includes('success') ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' :
                              activity.action_type.includes('error') ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' :
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400'
                            }`}>
                              {activity.action_type.includes('success') ? 'Success' :
                               activity.action_type.includes('error') ? 'Error' :
                               'Activity'}
                            </span>
                          </div>
                          
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-2 mb-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(activity.created_at)}
                            </div>
                            
                            {activity.details && (
                              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                {typeof activity.details === 'object' ? (
                                  <div className="space-y-1">
                                    {Object.entries(activity.details).map(([key, value]) => (
                                      <div key={key} className="text-xs">
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{key}:</span>{' '}
                                        <span className="text-gray-600 dark:text-gray-400">
                                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {String(activity.details)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}