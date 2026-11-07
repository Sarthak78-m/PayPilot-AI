import { createSupabaseServerClient, createSupabaseAuthClient } from "@/lib/supabase/server";
import {
  createCheckoutOrder,
  extractClientIp,
  buildRateLimitKey,
  enforceRateLimit,
  checkServerPaymentFeatureGuard,
} from "@/lib/payments";
import { createPayPalOrder } from "@/lib/paypal";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/paypal/create-order
 *
 * Secure server-side PayPal Sandbox Order creation endpoint.
 *
 * Supports two checkout modes:
 * 1. Customer Public Checkout: accepts { token: string } (Base64URL payment link token)
 * 2. Authenticated Merchant/Client Checkout: accepts { invoiceId: string } with active session
 *
 * Security & Integrity Guarantees:
 * - Computes and verifies amount and currency strictly from database records (NEVER trusts client amount).
 * - Enforces order ownership, invoice lifecycle states, and currency validity.
 * - Generates idempotent PayPal-Request-Id tokens.
 * - Creates an official PayPal Orders v2 resource with intent: CAPTURE.
 * - Records PayPal order reference in the PayPilot database.
 */
export async function POST(request) {
  try {
    // 0. Feature Guard
    const featureGuardResponse = checkServerPaymentFeatureGuard();
    if (featureGuardResponse) {
      return featureGuardResponse;
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return Response.json(
        { success: false, error: "Request body must be valid JSON.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const token = input?.token || input?.paymentToken;
    const invoiceId = input?.invoiceId;

    if (!token && !invoiceId) {
      return Response.json(
        {
          success: false,
          error: "Either a payment token or invoiceId reference is required.",
          code: "MISSING_PAYMENT_REFERENCE",
        },
        { status: 400 }
      );
    }

    const supabaseClient = createSupabaseServerClient();
    const clientIp = extractClientIp(request);

    // ─────────────────────────────────────────────────────────────────────────
    // MODE A: Public Customer Checkout (via Payment Link Token)
    // ─────────────────────────────────────────────────────────────────────────
    if (token) {
      const cleanToken = String(token).trim();
      const rateLimitKey = buildRateLimitKey("create_order", cleanToken, clientIp);

      const rateLimit = await enforceRateLimit({
        key: rateLimitKey,
        limit: 15,
        windowSeconds: 60,
        supabaseClient,
      });

      if (!rateLimit.allowed) {
        return Response.json(
          {
            success: false,
            error: rateLimit.isServiceUnavailable
              ? "Payment service temporarily unavailable."
              : "Rate limit exceeded. Please try again shortly.",
            code: rateLimit.isServiceUnavailable ? "SERVICE_UNAVAILABLE" : "RATE_LIMIT_EXCEEDED",
          },
          {
            status: rateLimit.isServiceUnavailable ? 503 : 429,
            headers: { "Retry-After": String(rateLimit.retryAfter || 60) },
          }
        );
      }

      const result = await createCheckoutOrder({
        token: cleanToken,
        supabaseClient,
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
          orderId: result.orderId,
          paymentId: result.paymentId,
          status: result.status,
          mode: "sandbox",
        },
        { status: 200 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODE B: Authenticated User Checkout (via invoiceId)
    // ─────────────────────────────────────────────────────────────────────────
    const cleanInvoiceId = String(invoiceId).trim();

    // 1. Authenticate currently logged-in user
    let user;
    try {
      const authClient = await createSupabaseAuthClient();
      const { data: authData } = await authClient.auth.getUser();
      user = authData?.user;
    } catch {
      user = null;
    }

    if (!user) {
      return Response.json(
        { success: false, error: "Authentication required to initiate checkout.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // 2. Retrieve actual transaction/invoice details from database
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from("invoices")
      .select("id, user_id, customer_name, customer_email, description, amount, currency, status")
      .eq("id", cleanInvoiceId)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return Response.json(
        { success: false, error: "Invoice not found.", code: "INVOICE_NOT_FOUND" },
        { status: 404 }
      );
    }

    // 3. Verify order ownership
    if (invoice.user_id !== user.id) {
      return Response.json(
        { success: false, error: "You do not have permission to pay this invoice.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // 4. Validate invoice status
    if (invoice.status === "PAID") {
      return Response.json(
        { success: false, error: "This invoice has already been settled.", code: "INVOICE_ALREADY_PAID" },
        { status: 409 }
      );
    }

    if (invoice.status === "CANCELLED") {
      return Response.json(
        { success: false, error: "This invoice has been cancelled.", code: "INVOICE_CANCELLED" },
        { status: 409 }
      );
    }

    // 5. Authoritative amount and currency validation
    const authoritativeAmount = Number(invoice.amount);
    const authoritativeCurrency = String(invoice.currency || "USD").toUpperCase();

    if (!authoritativeAmount || authoritativeAmount <= 0) {
      return Response.json(
        { success: false, error: "Invalid invoice payable amount.", code: "INVALID_AMOUNT" },
        { status: 400 }
      );
    }

    // 6. Idempotency & existing active PayPal order reuse
    const { data: existingPayment } = await supabaseClient
      .from("payments")
      .select("id, status, paypal_order_id, create_request_id")
      .eq("invoice_id", invoice.id)
      .in("status", ["ORDER_CREATED", "APPROVED", "pending"])
      .maybeSingle();

    if (existingPayment?.paypal_order_id) {
      return Response.json(
        {
          success: true,
          orderId: existingPayment.paypal_order_id,
          paymentId: existingPayment.id,
          status: existingPayment.status,
          mode: "sandbox",
        },
        { status: 200 }
      );
    }

    // 7. Generate idempotency request ID
    const createRequestId = existingPayment?.create_request_id || crypto.randomUUID();

    // 8. Create PayPal Order v2 via Sandbox API
    let payPalOrder;
    try {
      payPalOrder = await createPayPalOrder({
        amount: authoritativeAmount,
        currency: authoritativeCurrency,
        requestId: createRequestId,
        invoiceId: invoice.id,
        description: invoice.description || `PayPilot Invoice #${invoice.id.slice(0, 8)}`,
      });
    } catch (gatewayErr) {
      return Response.json(
        {
          success: false,
          error: "Payment gateway error during order creation. Please retry.",
          code: gatewayErr.code || "PAYPAL_ORDER_CREATION_FAILED",
        },
        { status: gatewayErr.statusCode === 429 ? 429 : 502 }
      );
    }

    if (!payPalOrder?.orderId) {
      return Response.json(
        { success: false, error: "Invalid response from PayPal Sandbox.", code: "GATEWAY_RESPONSE_INVALID" },
        { status: 502 }
      );
    }

    // 9. Save PayPal order reference in database
    let paymentRecordId = existingPayment?.id;
    if (existingPayment) {
      await supabaseClient
        .from("payments")
        .update({
          paypal_order_id: payPalOrder.orderId,
          status: "ORDER_CREATED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPayment.id);
    } else {
      const { data: insertedPayment } = await supabaseClient
        .from("payments")
        .insert({
          invoice_id: invoice.id,
          amount: authoritativeAmount,
          status: "ORDER_CREATED",
          gateway: "paypal",
          paypal_order_id: payPalOrder.orderId,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      paymentRecordId = insertedPayment?.id || null;
    }

    return Response.json(
      {
        success: true,
        orderId: payPalOrder.orderId,
        paymentId: paymentRecordId,
        status: "ORDER_CREATED",
        mode: "sandbox",
      },
      { status: 200 }
    );
  } catch {
    return Response.json(
      { success: false, error: "An unexpected error occurred during order creation.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
