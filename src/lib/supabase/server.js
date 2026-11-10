import "server-only";

import dns from "node:dns";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore if unsupported in environment
}

let cachedPublicServerClient = null;
let cachedPublicServerConfigKey = null;

let cachedServerClient = null;
let cachedServerConfigKey = null;

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  return { supabaseUrl, supabasePublishableKey };
}

export async function createSupabaseAuthClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. Route handlers and proxy.js do.
        }
      },
    },
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  });
}

export function createSupabasePublicServerClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();
  const configKey = `${supabaseUrl}::${supabasePublishableKey}`;

  if (cachedPublicServerClient && cachedPublicServerConfigKey === configKey) {
    return cachedPublicServerClient;
  }

  cachedPublicServerClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  cachedPublicServerConfigKey = configKey;

  return cachedPublicServerClient;
}

export function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  const configKey = `${supabaseUrl}::${secretKey}`;
  if (cachedServerClient && cachedServerConfigKey === configKey) {
    return cachedServerClient;
  }

  cachedServerClient = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  cachedServerConfigKey = configKey;

  return cachedServerClient;
}
