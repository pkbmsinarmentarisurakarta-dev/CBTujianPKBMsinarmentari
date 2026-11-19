import { createClient } from '@supabase/supabase-js';

// HANYA menggunakan public anon key untuk frontend; SUPABASE_SERVICE_ROLE_KEY hanya ada di server!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isFrontendSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isFrontendSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
