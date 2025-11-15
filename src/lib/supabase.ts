import { createClient } from '@supabase/supabase-js';

// Updated Supabase URL and key from new project configuration
const supabaseUrl = 'https://ggqzgorzmxjucqqzmsoj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdncXpnb3J6bXhqdWNxcXptc29qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxODgxNjAsImV4cCI6MjA3Nzc2NDE2MH0.d0J96KCaLBdNMIWCfOMRNuQEEfk3uaZDqM44JkBxsvk';

// DEBUG: Log which configuration is being used
console.log('=== SUPABASE CONFIG DEBUG ===');
console.log('Supabase URL:', supabaseUrl);
console.log('Environment VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Using updated project configuration');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface InventoryItem {
  id: string;
  user_id: string;
  barcode: string;
  product: string;
  colour: string | null;
  size: string | null;
  quantity: number;
  low_stock_threshold: number;
  zone: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  inventory_item_id: string | null;
  action: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

export interface GoogleSheetsSync {
  id: string;
  user_id: string;
  sheet_id: string | null;
  sheet_name: string | null;
  last_sync_at: string | null;
  sync_status: string;
  error_message: string | null;
  created_at: string;
}

export interface UserProfile {
  user_id: string;
  full_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string;
  action_type: string;
  item_id: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
}

// Activity logging utility - ONLY logs user login events
export async function logActivity(
  action_type: string,
  item_id: string | null = null,
  details: any = {}
) {
  try {
    // Only log user_login events, ignore all other activity types
    if (action_type !== 'user_login') {
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('user_activity_logs').insert({
      user_id: user.id,
      user_email: user.email,
      action_type,
      item_id,
      details
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}
