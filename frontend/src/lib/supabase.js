import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase =
  isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const supabaseBuckets = {
  clients: import.meta.env.VITE_SUPABASE_CLIENT_BUCKET || "client-assets",
  documents: import.meta.env.VITE_SUPABASE_DOCUMENT_BUCKET || "case-documents",
};

export const supabaseRedirectTo =
  import.meta.env.VITE_SUPABASE_REDIRECT_URL || `${window.location.origin}/login`;
