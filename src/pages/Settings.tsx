import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NetworkStatusIndicator } from '@/components/NetworkStatus';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, 
  Download, 
  RefreshCw, 
  CheckCircle2,
  Info,
  ExternalLink,
  Upload,
  FileText,
  AlertCircle,
  X
} from 'lucide-react';

interface PreviewData {
  headers: string[];
  rows: string[][];
  errors: { line: number; error: string }[];
}

interface UploadedFile {
  id: string;
  file: File;
  previewData?: PreviewData;
  importResult?: any;
  status: 'pending' | 'preview' | 'importing' | 'completed' | 'error';
}

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [csvLoading, setCsvLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update' | 'new'>('skip');
  const [isDragging, setIsDragging] = useState(false);
  const [importAllLoading, setImportAllLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleCsvDownload = async () => {
    setCsvLoading(true);
    setMessage(null);

    try {
      // Get user's session token for authentication
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Use the actual URL from the supabase configuration
      const supabaseUrl = 'https://ggqzgorzmxjucqqzmsoj.supabase.co';

      const response = await fetch(`${supabaseUrl}/functions/v1/export-csv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to generate CSV');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setMessage({
        type: 'success',
        text: 'CSV file downloaded successfully!'
      });

    } catch (error: any) {
      console.error('CSV download error:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Failed to download CSV file'
      });
    } finally {
      setCsvLoading(false);
    }
  };

  const handleFileUpload = (files: FileList) => {
    if (files.length === 0) return;
    
    const file = files[0]; // Only take the first file
    
    if (!file.name.endsWith('.csv')) {
      setMessage({
        type: 'error',
        text: `File "${file.name}" is not a CSV file`
      });
      return;
    }

    const newFile: UploadedFile = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file: file,
      status: 'pending'
    };

    // Clear existing files and add the new one (single file only)
    setUploadedFiles([newFile]);

    // Read and preview file
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const previewData = parseCSVPreview(text);
      
      setUploadedFiles([{ ...newFile, previewData, status: 'preview' }]);
    };
    reader.readAsText(file);

    setMessage(null);
  };

  const parseCSVPreview = (csvText: string): PreviewData | null => {
    const lines = csvText.trim().split('\n');
    
    if (lines.length < 2) {
      setMessage({
        type: 'error',
        text: 'CSV file must contain headers and at least one data row'
      });
      return null;
    }

    // Parse headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Validate required fields (quantity is optional)
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

    // Parse first 10 rows for preview
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

      // Validate row
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

  const handleImport = async (fileId: string) => {
    const fileToImport = uploadedFiles.find(f => f.id === fileId);
    if (!fileToImport) return;

    // Update file status to importing
    setUploadedFiles(prev => 
      prev.map(f => f.id === fileId ? { ...f, status: 'importing' as const } : f)
    );

    setMessage(null);

    try {
      const reader = new FileReader();
      
      // Wrap FileReader in a Promise to properly handle async
      const csvText = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };
        reader.readAsText(fileToImport.file);
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        'https://ggqzgorzmxjucqqzmsoj.supabase.co/functions/v1/import-csv',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            csvData: csvText,
            duplicateAction: duplicateAction
          })
        }
      );

      const result = await response.json();

      if (!result.success) {
        if (result.errors) {
          const errorMessages = result.errors.map((e: any) => 
            `Line ${e.line}: ${e.error}`
          ).join('\n');
          throw new Error(`Validation errors:\n${errorMessages}`);
        }
        throw new Error(result.error?.message || 'Import failed');
      }

      // Update file with import result
      setUploadedFiles(prev => 
        prev.map(f => f.id === fileId ? { 
          ...f, 
          importResult: result.data, 
          status: 'completed' as const 
        } : f)
      );

      setMessage({
        type: 'success',
        text: `Successfully imported ${result.data.total} items from ${fileToImport.file.name}: ${result.data.inserted} new, ${result.data.updated} updated, ${result.data.skipped} skipped`
      });

    } catch (error: any) {
      console.error('Import error:', error);
      
      // Update file with error status
      setUploadedFiles(prev => 
        prev.map(f => f.id === fileId ? { 
          ...f, 
          status: 'error' as const 
        } : f)
      );

      setMessage({
        type: 'error',
        text: `Failed to import ${fileToImport.file.name}: ${error.message || 'Unknown error'}`
      });
    }
  };

  const handleImportAll = async () => {
    const pendingFiles = uploadedFiles.filter(f => f.status === 'preview' && !f.previewData?.errors.length);
    if (pendingFiles.length === 0) return;

    setImportAllLoading(true);
    setMessage(null);

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const file of pendingFiles) {
      try {
        await handleImport(file.id);
        
        // Wait a bit between imports to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        totalErrors++;
      }
    }

    // Show summary message
    setMessage({
      type: 'info',
      text: `Import process completed. Check individual file results above.`
    });

    setImportAllLoading(false);
  };

  const clearUpload = () => {
    setUploadedFiles([]);
    setMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
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
            <NetworkStatusIndicator />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Data Management</h1>
              <p className="text-gray-600 dark:text-gray-400">Import and export your inventory data</p>
            </div>
            <button
              onClick={() => navigate('/file-manager')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              File Manager
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'success' ? 'bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' :
            message.type === 'error' ? 'bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300' :
            'bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-6 h-6 flex-shrink-0" /> :
             message.type === 'error' ? <AlertCircle className="w-6 h-6 flex-shrink-0" /> :
             <Info className="w-6 h-6 flex-shrink-0" />}
            <span className="whitespace-pre-line">{message.text}</span>
          </div>
        )}

        {/* CSV Import */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg">
              <Upload className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import Inventory Data</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Bulk import items from a CSV file</p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">CSV Format Requirements</p>
                <p className="mb-2">Required fields: product_name, barcode, colour, size</p>
                <p className="mb-2">Optional fields: zone, quantity (defaults to 0 if not provided)</p>
                <p className="font-mono text-xs bg-white dark:bg-gray-900 p-2 rounded mt-2">
                  product_name,barcode,colour,size,zone,quantity<br/>
                  "ADVANTAGE SHORT 2.0","123456789","BLACK","L","A1","50"
                </p>
              </div>
            </div>
          </div>

          {uploadedFiles.length === 0 ? (
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
                Drag and drop your CSV file here, or
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Upload one CSV file at a time for import
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
              {/* Current File Display */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    Current File
                  </h3>
                  {uploadedFiles.length > 0 && (
                    <button
                      onClick={clearUpload}
                      className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      Clear File
                    </button>
                  )}
                </div>
                
                {uploadedFiles.map((uploadedFile) => (
                  <div key={uploadedFile.id} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    {/* File Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                            {uploadedFile.file.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {(uploadedFile.file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Status Badge */}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          uploadedFile.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' :
                          uploadedFile.status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' :
                          uploadedFile.status === 'importing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400' :
                          uploadedFile.previewData?.errors.length ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-400'
                        }`}>
                          {uploadedFile.status === 'completed' ? 'Completed' :
                           uploadedFile.status === 'error' ? 'Error' :
                           uploadedFile.status === 'importing' ? 'Importing...' :
                           uploadedFile.previewData?.errors.length ? 'Has Errors' :
                           'Ready to Import'}
                        </span>
                        
                        {/* Remove Button */}
                        <button
                          onClick={() => removeFile(uploadedFile.id)}
                          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          title="Remove file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Preview Data */}
                    {uploadedFile.previewData && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                          Preview: {uploadedFile.previewData.rows.length} rows (showing first 10)
                        </div>
                        
                        {/* Errors */}
                        {uploadedFile.previewData.errors.length > 0 && (
                          <div className="mb-2">
                            <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                              Validation Errors ({uploadedFile.previewData.errors.length}):
                            </div>
                            <div className="max-h-20 overflow-y-auto bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                              {uploadedFile.previewData.errors.slice(0, 3).map((error, idx) => (
                                <div key={idx} className="text-xs text-red-700 dark:text-red-400">
                                  Line {error.line}: {error.error}
                                </div>
                              ))}
                              {uploadedFile.previewData.errors.length > 3 && (
                                <div className="text-xs text-red-600 dark:text-red-500 mt-1">
                                  ... and {uploadedFile.previewData.errors.length - 3} more errors
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Import Result */}
                        {uploadedFile.importResult && (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2 mb-3">
                            <div className="text-xs text-green-800 dark:text-green-400">
                              <div className="font-medium mb-1">Import Result:</div>
                              <div>Total: {uploadedFile.importResult.total} | New: {uploadedFile.importResult.inserted} | Updated: {uploadedFile.importResult.updated} | Skipped: {uploadedFile.importResult.skipped}</div>
                            </div>
                          </div>
                        )}

                        {/* Import Button */}
                        {uploadedFile.status === 'preview' && uploadedFile.previewData.errors.length === 0 && (
                          <button
                            onClick={() => handleImport(uploadedFile.id)}
                            disabled={importLoading}
                            className="w-full bg-blue-600 dark:bg-blue-700 text-white py-2 px-3 rounded text-sm hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                          >
                            <Upload className="w-4 h-4" />
                            Import This File
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Import All Button */}
              {uploadedFiles.some(f => f.status === 'preview' && !f.previewData?.errors.length) && (
                <button
                  onClick={handleImportAll}
                  disabled={importAllLoading}
                  className="w-full bg-green-600 dark:bg-green-700 text-white py-3 px-4 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                >
                  {importAllLoading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Importing file...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Import File
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* CSV Export */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded-lg">
              <Download className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Export Inventory Data</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Download your inventory data as a CSV file</p>
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-800 dark:text-green-200">
                <p className="font-medium mb-1">Instant Download - No Setup Required</p>
                <p>Download your inventory data immediately as a CSV file that you can open in Excel, Google Sheets, or any spreadsheet application.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This method downloads a CSV file with all your current inventory data including: ID, Product name, Barcode, Colour, Size, Zone, Quantity, Low Stock Threshold, and timestamps. Perfect for quick backups, data analysis, or integration with other systems.
            </p>
            
            <button
              onClick={handleCsvDownload}
              disabled={csvLoading}
              className="w-full bg-green-600 dark:bg-green-700 text-white py-3 px-4 rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
            >
              {csvLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Generating CSV file...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Download Inventory as CSV
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}