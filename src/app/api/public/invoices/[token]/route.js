import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  lookupPublicInvoice,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
} from "@/lib/payments";

export async function GET(request, { params }) {
  try {
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
      return Response.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again shortly.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        }
      );
    }

    // 2. Lookup public invoice details
    const result = await lookupPublicInvoice({ token, supabaseClient });

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error, code: result.code },
        { status: result.statusCode }
      );
    }

    return Response.json(
      {
        success: true,
        data: result.data,
      },
      { status: 200 }
    );
  } catch {
    return Response.json(
      { success: false, error: "Payment link is invalid or has expired.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
