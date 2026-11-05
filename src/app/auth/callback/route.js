import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/supabase/server";
import { getSiteBaseUrl, getSafeInternalRedirect } from "@/lib/auth/url";
import { ensureUserProfile } from "@/lib/auth/profile";

export const dynamic = "force-dynamic";

/**
 * Next.js Route Handler for Supabase Auth Callbacks.
 * Handles:
 * 1. PKCE Authorization Code Exchange (OAuth and PKCE Email Confirmation / Recovery).
 * 2. OTP Token Hash Verification (verifyOtp for signup, recovery, email_change).
 * 3. Provider error handling (e.g. user cancelled Google OAuth consent).
 * 4. Safe open-redirect prevention using allowlisted internal application paths.
 * 5. Idempotent user profile creation for new OAuth sign-ins.
 */
export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const nextParam = requestUrl.searchParams.get("next");
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDesc = requestUrl.searchParams.get("error_description");

  const baseUrl = getSiteBaseUrl(request);

  // 1. Handle OAuth provider errors (e.g. user cancelled consent screen)
  if (providerError) {
    const errorMsg =
      providerErrorDesc ||
      (providerError === "access_denied"
        ? "Sign-in was cancelled. Please try again."
        : "Authentication provider error occurred.");

    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("error", errorMsg);
    return NextResponse.redirect(loginUrl.toString());
  }

  // 2. Resolve safe internal destination path
  const isRecoveryFlow = type === "recovery" || nextParam === "/reset-password";
  const defaultDestination = isRecoveryFlow ? "/reset-password" : "/dashboard";
  const safeRedirectPath = getSafeInternalRedirect(nextParam, defaultDestination);

  try {
    const supabase = await createSupabaseAuthClient();

    // 3. Process PKCE authorization code exchange
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        const loginUrl = new URL("/login", baseUrl);
        loginUrl.searchParams.set(
          "error",
          "Your verification or recovery link is invalid, expired, or has already been used. Please try again.",
        );
        return NextResponse.redirect(loginUrl.toString());
      }

      if (data?.user) {
        await ensureUserProfile({ user: data.user });
      }

      // If this is password recovery, route directly to /reset-password
      if (isRecoveryFlow) {
        return NextResponse.redirect(new URL("/reset-password", baseUrl).toString());
      }

      return NextResponse.redirect(new URL(safeRedirectPath, baseUrl).toString());
    }

    // 4. Process OTP token_hash verification
    if (tokenHash && type) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        const loginUrl = new URL("/login", baseUrl);
        loginUrl.searchParams.set(
          "error",
          "The email verification link is invalid, expired, or has already been used.",
        );
        return NextResponse.redirect(loginUrl.toString());
      }

      if (data?.user) {
        await ensureUserProfile({ user: data.user });
      }

      if (type === "recovery") {
        return NextResponse.redirect(new URL("/reset-password", baseUrl).toString());
      }

      // Successful email confirmation: redirect to dashboard if session established,
      // or to login with confirmed status
      if (data?.session) {
        return NextResponse.redirect(new URL(safeRedirectPath, baseUrl).toString());
      }

      const loginConfirmedUrl = new URL("/login", baseUrl);
      loginConfirmedUrl.searchParams.set("confirmed", "true");
      return NextResponse.redirect(loginConfirmedUrl.toString());
    }

    // 5. Missing code or token parameters
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("error", "Missing authentication verification parameters.");
    return NextResponse.redirect(loginUrl.toString());
  } catch {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set(
      "error",
      "An unexpected error occurred during authentication verification. Please try again.",
    );
    return NextResponse.redirect(loginUrl.toString());
  }
}
