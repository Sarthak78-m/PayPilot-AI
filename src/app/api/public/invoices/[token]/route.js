import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  lookupPublicInvoice,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
  checkServerPaymentFeatureGuard,
} from "@/lib/payments";

const PUBLIC_SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET(request, { params }) {
  try {
    // 0. Server-side payment feature guard
    const featureGuardResponse = checkServerPaymentFeatureGuard();
    if (featureGuardResponse) {
      featureGuardResponse.headers.set("Referrer-Policy", "no-referrer");
      return featureGuardResponse;
    }

    const { token } = await params;

    const supabaseClient = createSupabaseServerClient();
    const clientIp = extractClientIp(request);
    const rateLimitKey = buildRateLimitKey("public_lookup", token, clientIp);

    // 1. Rate limiting (30 public lookups per minute per IP / token)
    const rateLimit = await enforceRateLimit({
      key: rateLimitKey,
      limit: 30,
      windowSeconds: 60,
      supabaseClient,
    });

    if (!rateLimit.allowed) {
      if (rateLimit.isServiceUnavailable) {
        return Response.json(
          {
            success: false,
            error: "Payment service is temporarily unavailable. Please try again shortly.",
            code: "SERVICE_UNAVAILABLE",
          },
          {
            status: 503,
            headers: {
              ...PUBLIC_SECURITY_HEADERS,
              "Retry-After": String(rateLimit.retryAfter || 60),
            },
          }
        );
      }
      return Response.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again shortly.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        {
          status: 429,
          headers: {
            ...PUBLIC_SECURITY_HEADERS,
            "Retry-After": String(rateLimit.retryAfter),
          },
        }
      );
    }

    // 2. Lookup public invoice details
    const result = await lookupPublicInvoice({ token, supabaseClient });

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error, code: result.code },
        {
          status: result.statusCode,
          headers: PUBLIC_SECURITY_HEADERS,
        }
      );
    }

    return Response.json(
      {
        success: true,
        data: result.data,
      },
      {
        status: 200,
        headers: PUBLIC_SECURITY_HEADERS,
      }
    );
  } catch {
    return Response.json(
      { success: false, error: "Payment link is invalid or has expired.", code: "INTERNAL_ERROR" },
      {
        status: 500,
        headers: PUBLIC_SECURITY_HEADERS,
      }
    );
  }
}
