import "server-only";

import { createSupabaseAuthClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}
