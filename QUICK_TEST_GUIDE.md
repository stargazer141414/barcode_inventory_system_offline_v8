# Quick Testing Guide - Offline Scanning Feature

## Test Account Credentials
**URL**: https://8cl0gny04b8s.space.minimax.io
**Email**: mzpyztgw@minimax.com
**Password**: zS41PZ5ILt

## Quick Test Steps

### 1. Test Online Scanning (30 seconds)
1. Login to the website
2. Go to Scanner page
3. Type barcode "TEST-ONLINE-001" and press Enter
4. Verify success message appears
5. Check item shows in "Last Scanned Item" section

### 2. Test Offline Mode (2 minutes)
1. Open browser DevTools (Press F12)
2. Go to "Network" tab
3. Check "Offline" checkbox
4. Return to Scanner page
5. Observe orange "Offline Mode Active" banner appears
6. Scan 3 barcodes:
   - "OFFLINE-001"
   - "OFFLINE-002"
   - "OFFLINE-003"
7. Verify each shows "Saved offline" message
8. Verify pending sync count shows "3" in header

### 3. Test Data Persistence (30 seconds)
1. While still offline, refresh the page (F5 or Ctrl+R)
2. Login again if needed
3. Check pending sync count still shows "3"
4. Navigate to Scanner page
5. Verify offline banner still appears

### 4. Test Auto-Sync (1 minute)
1. Go back to DevTools Network tab
2. Uncheck "Offline" to restore connection
3. Watch for:
   - Blue "Syncing..." banner appears
   - Progress shows (1 of 3, 2 of 3, 3 of 3)
   - Banner disappears when complete
4. Go to Dashboard
5. Verify all 6 items (3 online + 3 offline) appear in inventory

## Visual Indicators to Check

### Online Mode
- Green "Online" badge in header
- No orange banner at top
- Regular success messages

### Offline Mode  
- Orange "Offline" badge in header
- Orange "Offline Mode Active" banner at top
- Blue "Saved offline" messages
- Pending sync count badge (number)

### Syncing Mode
- Blue "Syncing..." banner at top
- Progress indicator showing "X of Y items"
- Spinning refresh icon

## Common Issues & Solutions

**Issue**: Service worker not loading
**Solution**: Hard refresh (Ctrl+Shift+R) and check HTTPS connection

**Issue**: Offline mode not detected
**Solution**: Close and reopen DevTools, try different "Offline" setting location

**Issue**: Sync not happening
**Solution**: Click "Sync Now" button in banner manually

**Issue**: Data not persisting
**Solution**: Check browser allows IndexedDB storage

## Browser Compatibility
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Full support

## Advanced Testing

### PWA Installation
1. While on website, look for "Install" icon in address bar
2. Click to install as app
3. Launch installed app
4. Test offline functionality in standalone app

### Service Worker Check
1. Open DevTools
2. Go to "Application" tab (Chrome) or "Storage" tab (Firefox)
3. Click "Service Workers" in left sidebar
4. Verify service worker is "activated and running"
5. Check cache storage for cached assets

### IndexedDB Inspection
1. Open DevTools > Application/Storage tab
2. Expand "IndexedDB" in left sidebar
3. Open "BarcodeInventoryDB" database
4. Check "pendingScans" store for queued items
5. Check "offlineInventory" store for cached data

## Expected Behavior Summary

**When Online**:
- Direct database updates
- Real-time sync
- Green indicators
- No banner

**When Offline**:
- Local storage to IndexedDB
- Orange indicators
- Offline banner visible
- Pending count increases

**When Reconnecting**:
- Automatic sync triggers
- Blue syncing banner
- Progress display
- Clean completion

All existing features (dashboard, CSV import/export, filters, dark mode) continue working normally.
