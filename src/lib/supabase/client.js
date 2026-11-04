import { createClient } from "@supabase/supabase-js";

let supabaseBrowserClient;

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase browser environment variables.");
  }

  if (!supabaseBrowserClient) {
    supabaseBrowserClient = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  return supabaseBrowserClient;
}
