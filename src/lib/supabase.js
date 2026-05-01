import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

let supabaseClient = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
    // Kick off auth initialization immediately so GoTrueClient's internal
    // initializePromise is set before React's first effect runs. Without this,
    // React Strict Mode's double-mount causes two competing lock acquisitions
    // because each onAuthStateChange call triggers its own _initialize() + lock.
    supabaseClient.auth.getSession().catch(() => {});
  }

  return supabaseClient;
}
