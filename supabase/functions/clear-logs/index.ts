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
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ 
        error: { message: 'Method not allowed' } 
      }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Extract user ID from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: { message: 'Authorization header missing' } 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceRoleKey
      }
    });

    if (!userResponse.ok) {
      return new Response(JSON.stringify({ 
        error: { message: 'Invalid authentication token' } 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const user = await userResponse.json();
    const userId = user.id;

    // Clear user activity logs
    const userLogsResponse = await fetch(`${supabaseUrl}/rest/v1/user_activity_logs?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });

    if (!userLogsResponse.ok) {
      const errorText = await userLogsResponse.text();
      throw new Error(`Failed to clear user activity logs: ${errorText}`);
    }

    // Clear inventory audit logs for this user
    const auditLogsResponse = await fetch(`${supabaseUrl}/rest/v1/inventory_audit_log?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });

    if (!auditLogsResponse.ok) {
      const errorText = await auditLogsResponse.text();
      throw new Error(`Failed to clear inventory audit logs: ${errorText}`);
    }

    // Return success response
    return new Response(JSON.stringify({ 
      data: { 
        message: 'All logs cleared successfully',
        cleared_tables: ['user_activity_logs', 'inventory_audit_log'],
        user_id: userId
      } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Clear logs error:', error);
    
    return new Response(JSON.stringify({
      error: {
        code: 'CLEAR_LOGS_ERROR',
        message: error.message || 'Failed to clear logs'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});