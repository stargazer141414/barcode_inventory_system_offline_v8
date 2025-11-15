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
    const { action, barcode, zone, productData } = await req.json();

    if (!action || !barcode) {
      throw new Error('Action and barcode are required');
    }

    if (!['increment', 'decrement'].includes(action)) {
      throw new Error('Action must be increment or decrement');
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

    console.log(`Processing ${action} for barcode: ${barcode}, user: ${userId}, zone: ${zone || 'none'}`);

    // Determine the zone - if no zone provided, default to "Unassigned"
    const targetZone = (zone && zone.trim()) ? zone.trim() : 'Unassigned';
    console.log(`Target zone: ${targetZone}`);

    // First, check if the barcode already exists in the database (for this user)
    const checkResponse = await fetch(`${supabaseUrl}/rest/v1/inventory_items?user_id=eq.${userId}&barcode=eq.${encodeURIComponent(barcode)}&select=*`, {
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });

    if (!checkResponse.ok) {
      const errorText = await checkResponse.text();
      console.error('Failed to check existing items:', errorText);
      throw new Error(`Failed to check existing items: ${errorText}`);
    }

    const existingItems = await checkResponse.json();
    console.log(`Found ${existingItems.length} existing items for barcode: ${barcode}`);
    existingItems.forEach((item, index) => {
      console.log(`  Item ${index + 1}: ID=${item.id}, Zone="${item.zone}", Quantity=${item.quantity}, Product="${item.product}"`);
    });

    let result;
    let isNewItem = false;

    // Check if we have existing items
    if (existingItems.length > 0) {
      // Find existing item in the target zone
      const itemInTargetZone = existingItems.find(item => (item.zone || '') === targetZone);
      
      // Find the most complete product information from existing items (prefer items with proper product names)
      let existingProductInfo = existingItems.find(item => 
        item.product && !item.product.startsWith('Product-') && item.product.trim() !== ''
      );
      
      // Fallback to any existing item if no proper product name found
      if (!existingProductInfo) {
        existingProductInfo = existingItems[0];
      }
      
      if (itemInTargetZone) {
        // Update existing item in target zone
        console.log('Found existing item in target zone:', itemInTargetZone);
        
        const currentQuantity = itemInTargetZone.quantity || 0;
        let newQuantity;

        if (action === 'increment') {
          newQuantity = currentQuantity + 1;
        } else {
          newQuantity = Math.max(0, currentQuantity - 1);
        }

        const updateData = {
          quantity: newQuantity,
          updated_at: new Date().toISOString()
        };

        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/inventory_items?id=eq.${itemInTargetZone.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(updateData)
        });

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          throw new Error(`Failed to update item: ${errorText}`);
        }

        const updatedItems = await updateResponse.json();
        result = { ...updatedItems[0], isNewItem: false };
        console.log('Updated existing item in target zone:', result);
        
      } else {
        // Create new item in target zone using existing product information
        console.log(`Creating new item in target zone "${targetZone}" using existing product info`);
        isNewItem = true;
        
        const newItem = {
          user_id: userId,
          barcode: barcode.trim(),
          product: existingProductInfo?.product || productData?.product || `Product-${barcode.trim()}`,
          colour: existingProductInfo?.colour || productData?.colour || '',
          size: existingProductInfo?.size || productData?.size || '',
          zone: targetZone,
          quantity: action === 'increment' ? 1 : 0,
          low_stock_threshold: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        console.log('Creating new item with existing product info:', newItem);

        const createResponse = await fetch(`${supabaseUrl}/rest/v1/inventory_items`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(newItem)
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(`Failed to create new item: ${errorText}`);
        }

        const createdItems = await createResponse.json();
        result = { ...createdItems[0], isNewItem: true };
        console.log('Created new item in target zone with existing product info:', result);
      }

    } else {
      // No existing items - create new item
      console.log(`Creating new item for barcode: ${barcode} in zone: ${targetZone}`);
      isNewItem = true;

      const newItem = {
        user_id: userId,
        barcode: barcode.trim(),
        product: productData?.product || `Product-${barcode.trim()}`,
        colour: productData?.colour || '',
        size: productData?.size || '',
        zone: targetZone,
        quantity: action === 'increment' ? 1 : 0,
        low_stock_threshold: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('Creating new item with data:', newItem);

      const createResponse = await fetch(`${supabaseUrl}/rest/v1/inventory_items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(newItem)
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create new item: ${errorText}`);
      }

      const createdItems = await createResponse.json();
      result = { ...createdItems[0], isNewItem: true };
      console.log('Created new item:', result);
    }

    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Sync inventory error:', error);
    
    const errorResponse = {
      error: {
        code: 'SYNC_INVENTORY_ERROR',
        message: error.message || 'Failed to sync inventory'
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});