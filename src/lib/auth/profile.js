import "server-only";

import { createSupabaseServerClient, createSupabaseAuthClient } from "@/lib/supabase/server";

/**
 * Ensures a matching record exists in public.profiles for an authenticated Supabase user.
 * Compatible with both Email/Password and Google OAuth sign-ups.
 *
 * Rules:
 * 1. Uses the cryptographically verified user.id from Supabase Auth (never client input).
 * 2. Never creates duplicate profiles.
 * 3. Never overwrites existing customized profile attributes (e.g. business_name).
 * 4. Fails safely without disrupting the authentication lifecycle.
 *
 * @param {object} params
 * @param {object} params.user - Authenticated Supabase User object
 * @returns {Promise<{ success: boolean, profile?: object, created: boolean }>}
 */
export async function ensureUserProfile({ user }) {
  if (!user || !user.id) {
    return { success: false, created: false };
  }

  const userId = user.id;
  const userEmail = user.email || null;
  const metadataName =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    (user.email ? user.email.split("@")[0] : null);

  try {
    // Prefer service-role client if available to ensure RLS bypass during account onboarding;
    // otherwise fallback to authenticated user SSR client.
    let supabase;
    if (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createSupabaseServerClient();
    } else {
      supabase = await createSupabaseAuthClient();
    }

    // 1. Check if profile already exists
    const { data: existingProfile, error: selectError } = await supabase
      .from("profiles")
      .select("id, name, email, business_name")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile) {
      // Profile exists: do not overwrite user-customized details.
      // If name was previously empty and OAuth provides a name, backfill name only.
      if (!existingProfile.name && metadataName) {
        await supabase
          .from("profiles")
          .update({ name: metadataName, updated_at: new Date().toISOString() })
          .eq("id", userId);
      }

      return { success: true, profile: existingProfile, created: false };
    }

    // 2. Insert new profile record
    const newProfile = {
      id: userId,
      email: userEmail,
      name: metadataName,
      business_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await supabase
      .from("profiles")
      .insert(newProfile)
      .select()
      .maybeSingle();

    if (insertError) {
      // If error is duplicate key (race condition with DB trigger), retrieve existing
      if (insertError.code === "23505") {
        return { success: true, created: false };
      }
      return { success: false, created: false };
    }

    return { success: true, profile: inserted || newProfile, created: true };
  } catch {
    // Fail safely — profile sync error must not prevent login/auth
    return { success: false, created: false };
  }
}
