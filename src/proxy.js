import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/invoices", "/payments", "/assistant", "/settings"];

export async function proxy(request) {
  let response = NextResponse.next({ request });

  // Strengthen Referrer-Policy on public checkout routes
  if (request.nextUrl.pathname.startsWith("/pay") || request.nextUrl.pathname.startsWith("/api/public")) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Skip auth operations on non-protected paths (including /auth/callback, public checkout, etc.)
  if (!isProtectedRoute) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return response;
  }

  const cookiesToPass = [];

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });
        if (request.nextUrl.pathname.startsWith("/pay") || request.nextUrl.pathname.startsWith("/api/public")) {
          response.headers.set("Referrer-Policy", "no-referrer");
        }
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
          cookiesToPass.push({ name, value, options });
        });
      },
    },
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Unauthenticated user accessing protected dashboard route: redirect to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    cookiesToPass.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
