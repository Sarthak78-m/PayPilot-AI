import "server-only";

import dns from "node:dns";
import { cache } from "react";
import { createSupabaseAuthClient } from "@/lib/supabase/server";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore if unsupported in environment
}

export const getAuthenticatedUser = cache(async () => {
  const supabase = await createSupabaseAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
});
