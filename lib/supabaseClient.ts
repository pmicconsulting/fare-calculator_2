// lib/supabaseClient.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: SupabaseClient<any, 'public', any>;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Using mock client.');
  // Create a more complete mock client
  supabase = {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => Promise.resolve({ data: null, error: null }),
      delete: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      eq: function() { return this; },
      neq: function() { return this; },
      gt: function() { return this; },
      gte: function() { return this; },
      lt: function() { return this; },
      lte: function() { return this; },
      like: function() { return this; },
      ilike: function() { return this; },
      is: function() { return this; },
      in: function() { return this; },
      contains: function() { return this; },
      containedBy: function() { return this; },
      rangeGt: function() { return this; },
      rangeGte: function() { return this; },
      rangeLt: function() { return this; },
      rangeLte: function() { return this; },
      rangeAdjacent: function() { return this; },
      overlaps: function() { return this; },
      textSearch: function() { return this; },
      match: function() { return this; },
      not: function() { return this; },
      or: function() { return this; },
      filter: function() { return this; },
      order: function() { return this; },
      limit: function() { return this; },
      range: function() { return this; },
      single: function() { return this; },
      maybeSingle: function() { return this; },
    }),
    auth: {
      signInWithPassword: () => Promise.resolve({ data: null, error: null }),
      signUp: () => Promise.resolve({ data: null, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: null }, error: null }),
    },
    realtime: {
      channel: () => ({
        on: () => ({}),
        subscribe: () => ({}),
        unsubscribe: () => ({}),
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as SupabaseClient<any, 'public', any>;
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };

// Export a flag to check if Supabase is properly configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);