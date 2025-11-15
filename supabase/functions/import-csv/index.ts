Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { csvData, duplicateAction } = await req.json();

    if (!csvData) {
      throw new Error('CSV data is required');
    }

    // Get credentials
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase configuration missing');
    }

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token and get user
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceRoleKey
      }
    });

    if (!userResponse.ok) {
      throw new Error('Invalid token');
    }

    const userData = await userResponse.json();
    const userId = userData.id;

    // Parse CSV
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file must contain headers and at least one data row');
    }

    // Parse headers with proper quote handling
    const parseCSVLine = (line: string): string[] => {
      const values = [];
      let currentValue = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim().replace(/^"|"$/g, ''));
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim().replace(/^"|"$/g, ''));
      return values;
    };

    const headers = parseCSVLine(lines[0]).map((h: string) => h.toLowerCase().trim());
    
    // Validate required fields (quantity is optional)
    const requiredFields = ['product_name', 'barcode', 'colour', 'size'];
    const missingFields = requiredFields.filter(field => !headers.includes(field));
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Get column indexes
    const getColumnIndex = (name: string) => headers.indexOf(name);
    
    const productNameIdx = getColumnIndex('product_name');
    const barcodeIdx = getColumnIndex('barcode');
    const quantityIdx = getColumnIndex('quantity');
    const colourIdx = getColumnIndex('colour');
    const sizeIdx = getColumnIndex('size');
    const zoneIdx = getColumnIndex('zone');

    // Parse data rows
    const parsedRows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line using the same quote-aware function
      const values = parseCSVLine(line);

      // Validate row has correct number of columns
      if (values.length !== headers.length) {
        errors.push({
          line: i + 1,
          error: `Expected ${headers.length} columns, found ${values.length}`
        });
        continue;
      }

      // Extract values
      const productName = values[productNameIdx]?.trim();
      const barcode = values[barcodeIdx]?.trim();
      const quantityStr = quantityIdx >= 0 ? values[quantityIdx]?.trim() : '';
      const colour = values[colourIdx]?.trim();
      const size = values[sizeIdx]?.trim();
      const zone = zoneIdx >= 0 ? values[zoneIdx]?.trim() : '';

      // Validate required fields - provide specific feedback
      const missing = [];
      if (!productName) missing.push('product_name');
      if (!barcode) missing.push('barcode');
      if (!colour) missing.push('colour');
      if (!size) missing.push('size');
      
      if (missing.length > 0) {
        errors.push({
          line: i + 1,
          error: `Missing required fields: ${missing.join(', ')}`
        });
        continue;
      }

      // Parse quantity (optional, defaults to 0)
      let quantity = 0;
      if (quantityStr) {
        quantity = parseInt(quantityStr, 10);
        if (isNaN(quantity) || quantity < 0) {
          errors.push({
            line: i + 1,
            error: `Invalid quantity: ${quantityStr}`
          });
          continue;
        }
      }

      parsedRows.push({
        product: productName,
        barcode: barcode,
        quantity: quantity,
        colour: colour,
        size: size,
        zone: zone || '',
        user_id: userId
      });
    }

    // If there are parsing errors, return them
    if (errors.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        errors: errors,
        message: `Found ${errors.length} validation errors`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for duplicate barcodes in database
    const barcodes = parsedRows.map(row => row.barcode);
    const duplicateCheckResponse = await fetch(
      `${supabaseUrl}/rest/v1/inventory_items?user_id=eq.${userId}&barcode=in.(${barcodes.join(',')})&select=barcode,id`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        }
      }
    );

    const existingItems = duplicateCheckResponse.ok ? await duplicateCheckResponse.json() : [];
    const existingBarcodes = new Set(existingItems.map((item: any) => item.barcode));

    // Process rows based on duplicate action
    const toInsert = [];
    const toUpdate = [];
    const skipped = [];

    for (const row of parsedRows) {
      if (existingBarcodes.has(row.barcode)) {
        if (duplicateAction === 'skip') {
          skipped.push(row.barcode);
        } else if (duplicateAction === 'update') {
          toUpdate.push(row);
        } else if (duplicateAction === 'new') {
          // Create new item with modified barcode
          const timestamp = Date.now();
          toInsert.push({
            ...row,
            barcode: `${row.barcode}-${timestamp}`
          });
        }
      } else {
        toInsert.push(row);
      }
    }

    let insertedCount = 0;
    let updatedCount = 0;

    // Insert new items
    if (toInsert.length > 0) {
      const insertResponse = await fetch(`${supabaseUrl}/rest/v1/inventory_items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(toInsert)
      });

      if (!insertResponse.ok) {
        const errorText = await insertResponse.text();
        throw new Error(`Insert failed: ${errorText}`);
      }

      insertedCount = toInsert.length;
    }

    // Update existing items
    if (toUpdate.length > 0) {
      for (const item of toUpdate) {
        const existingItem = existingItems.find((ei: any) => ei.barcode === item.barcode);
        if (existingItem) {
          const updateResponse = await fetch(
            `${supabaseUrl}/rest/v1/inventory_items?id=eq.${existingItem.id}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({
                product: item.product,
                quantity: item.quantity,
                colour: item.colour,
                size: item.size,
                zone: item.zone,
                updated_at: new Date().toISOString()
              })
            }
          );

          if (updateResponse.ok) {
            updatedCount++;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skipped.length,
        total: parsedRows.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('CSV import error:', error);

    const errorResponse = {
      success: false,
      error: {
        code: 'CSV_IMPORT_FAILED',
        message: error.message
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
