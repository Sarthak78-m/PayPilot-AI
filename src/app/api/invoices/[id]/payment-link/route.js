import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateMerchantPaymentLink,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
} from "@/lib/payments";

export async function POST(request, { params }) {
  try {
    // 1. Authenticate merchant
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { success: false, error: "Authentication is required.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // 2. Parse request body
    let input = {};
    try {
      input = await request.json();
    } catch {
      // Empty or non-JSON body defaults to empty input
    }

    const expiresInDays = input.expiresInDays !== undefined ? input.expiresInDays : 7;
    const allowDraftTransition = Boolean(input.allowDraftTransition);

    // 3. Rate limiting (20 link generations per minute per merchant)
    const supabaseClient = createSupabaseServerClient();
    const clientIp = extractClientIp(request);
    const rateLimitKey = buildRateLimitKey("merchant_link", user.id, clientIp);

    const rateLimit = await enforceRateLimit({
      key: rateLimitKey,
      limit: 20,
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

    // 4. Generate payment link via service
    const result = await generateMerchantPaymentLink({
      invoiceId: id,
      user,
      expiresInDays,
      allowDraftTransition,
      supabaseClient,
      request,
    });

    if (!result.success) {
      return Response.json(
        { success: false, error: result.error, code: result.code },
        { status: result.statusCode }
      );
    }

    return Response.json(
      {
        success: true,
        paymentUrl: result.paymentUrl,
        expiresAt: result.expiresAt,
      },
      { status: 200 }
    );
  } catch {
    return Response.json(
      { success: false, error: "An unexpected error occurred.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
