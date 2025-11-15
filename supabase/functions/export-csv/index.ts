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

    console.log(`Exporting inventory for user: ${userId}`);

    // Fetch only items with quantity > 0 (scanned products visible on frontend)
    const inventoryResponse = await fetch(
      `${supabaseUrl}/rest/v1/inventory_items?user_id=eq.${userId}&quantity=gt.0&order=product.asc`, 
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!inventoryResponse.ok) {
      const errorText = await inventoryResponse.text();
      console.error('Failed to fetch inventory:', errorText);
      throw new Error(`Failed to fetch inventory: ${errorText}`);
    }

    const inventoryItems = await inventoryResponse.json();
    console.log(`Found ${inventoryItems.length} items with quantity > 0`);

    // Generate CSV content
    const csvHeaders = [
      'id',
      'product_name',
      'barcode', 
      'colour',
      'size',
      'zone',
      'quantity',
      'low_stock_threshold',
      'created_at',
      'updated_at'
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    inventoryItems.forEach(item => {
      const row = [
        item.id || '',
        item.product || '',
        item.barcode || '',
        item.colour || '',
        item.size || '',
        item.zone || '',
        item.quantity || 0,
        item.low_stock_threshold || 5,
        item.created_at || '',
        item.updated_at || ''
      ];
      
      // Escape fields that contain commas, quotes, or newlines
      const escapedRow = row.map(field => {
        if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      });
      
      csvContent += escapedRow.join(',') + '\n';
    });

    console.log(`Generated CSV with ${inventoryItems.length} items`);

    // Return CSV as a file attachment
    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="inventory-export-${new Date().toISOString().split('T')[0]}.csv"`
      }
    });

  } catch (error) {
    console.error('Export CSV error:', error);
    
    const errorResponse = {
      error: {
        code: 'EXPORT_CSV_ERROR',
        message: error.message || 'Failed to export CSV'
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});