// lib/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: SupabaseClient<any, 'public', any>;

if (!supabaseUrl || !supabaseAnonKey) {
  // 本番では簡素化
  throw new Error('Supabase環境変数が設定されていません');
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };