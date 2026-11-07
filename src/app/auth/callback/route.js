import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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
 * 5. Explicit Set-Cookie response preservation for all redirects (preventing session drops in Next.js).
 * 6. Idempotent user profile creation for new OAuth sign-ins.
 */
export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const nextParam = requestUrl.searchParams.get("next");
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDesc = requestUrl.searchParams.get("error_description");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const targetOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost.split(",")[0].trim()}`
    : requestUrl.origin || getSiteBaseUrl(request);

  // 1. Handle OAuth provider errors (e.g. user cancelled consent screen)
  if (providerError) {
    const errorMsg =
      providerErrorDesc ||
      (providerError === "access_denied"
        ? "Sign-in was cancelled. Please try again."
        : "Authentication provider error occurred.");

    const loginUrl = new URL("/login", targetOrigin);
    loginUrl.searchParams.set("error", errorMsg);
    return NextResponse.redirect(loginUrl.toString());
  }

  // 2. Resolve safe internal destination path
  const isRecoveryFlow = type === "recovery" || nextParam === "/reset-password";
  const defaultDestination = isRecoveryFlow ? "/reset-password" : "/dashboard";
  const safeRedirectPath = getSafeInternalRedirect(nextParam, defaultDestination);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    const loginUrl = new URL("/login", targetOrigin);
    loginUrl.searchParams.set("error", "Server authentication configuration is missing.");
    return NextResponse.redirect(loginUrl.toString());
  }

  // Track all cookies set by Supabase SSR to forward them directly onto the redirect response
  const cookiesToSetArray = [];
  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((cookie) => {
          cookiesToSetArray.push(cookie);
          try {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          } catch {
            // Safe fallback
          }
        });
      },
    },
    cookieOptions: {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  });

  const createRedirectResponse = (destinationUrl) => {
    const redirectResponse = NextResponse.redirect(destinationUrl);
    cookiesToSetArray.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options);
    });
    return redirectResponse;
  };

  try {
    // 3. Process PKCE authorization code exchange
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("[Auth Callback: exchangeCode error]", error.message);
        const loginUrl = new URL("/login", targetOrigin);

        let userMessage;
        if (isRecoveryFlow || type === "recovery") {
          userMessage =
            "Your password recovery link is invalid, expired, or has already been used. Please request a new link.";
        } else if (type === "signup") {
          userMessage =
            "Your verification link is invalid, expired, or has already been used. Please request a new confirmation email.";
        } else if (
          error.message?.toLowerCase().includes("code verifier") ||
          error.code === "pkce_code_verifier_not_found"
        ) {
          userMessage =
            "Authentication session expired or code verifier not found. Please try signing in again with Google.";
        } else if (
          error.message?.toLowerCase().includes("already registered") ||
          error.message?.toLowerCase().includes("already linked")
        ) {
          userMessage =
            "An account with this email address already exists. Please sign in with your email and password, or use password reset.";
        } else {
          userMessage = error.message || "Authentication failed during sign-in verification. Please try again.";
        }

        loginUrl.searchParams.set("error", userMessage);
        return createRedirectResponse(loginUrl.toString());
      }

      if (data?.user) {
        await ensureUserProfile({ user: data.user });
      }

      // If this is password recovery, route directly to /reset-password
      if (isRecoveryFlow) {
        return createRedirectResponse(new URL("/reset-password", targetOrigin).toString());
      }

      return createRedirectResponse(new URL(safeRedirectPath, targetOrigin).toString());
    }

    // 4. Process OTP token_hash verification
    if (tokenHash && type) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        console.error("[Auth Callback: verifyOtp error]", error.message);
        const loginUrl = new URL("/login", targetOrigin);
        loginUrl.searchParams.set(
          "error",
          "The email verification link is invalid, expired, or has already been used.",
        );
        return createRedirectResponse(loginUrl.toString());
      }

      if (data?.user) {
        await ensureUserProfile({ user: data.user });
      }

      if (type === "recovery") {
        return createRedirectResponse(new URL("/reset-password", targetOrigin).toString());
      }

      // Successful email confirmation: redirect to dashboard if session established,
      // or to login with confirmed status
      if (data?.session) {
        return createRedirectResponse(new URL(safeRedirectPath, targetOrigin).toString());
      }

      const loginConfirmedUrl = new URL("/login", targetOrigin);
      loginConfirmedUrl.searchParams.set("confirmed", "true");
      return createRedirectResponse(loginConfirmedUrl.toString());
    }

    // 5. Missing code or token parameters
    const loginUrl = new URL("/login", targetOrigin);
    loginUrl.searchParams.set("error", "Missing authentication verification parameters.");
    return createRedirectResponse(loginUrl.toString());
  } catch (err) {
    console.error("[Auth Callback: unexpected error]", err);
    const loginUrl = new URL("/login", targetOrigin);
    loginUrl.searchParams.set(
      "error",
      "An unexpected error occurred during authentication verification. Please try again.",
    );
    return createRedirectResponse(loginUrl.toString());
  }
}
