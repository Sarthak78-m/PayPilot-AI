import "server-only";

import { hashPaymentToken, isValidPaymentTokenFormat } from "./payment-token";
import { createPayPalOrder } from "@/lib/paypal";

/**
 * Validates public token, reserves a payment attempt via PostgreSQL RPC,
 * and initializes an idempotent PayPal Orders v2 transaction.
 *
 * @param {object} params
 * @param {string} params.token - Public Base64URL payment link token.
 * @param {object} params.supabaseClient - Trusted service-role Supabase client.
 * @param {object} [params.payPalConfig] - Optional PayPal configuration override.
 * @returns {Promise<{
 *   success: boolean,
 *   paymentId?: string,
 *   orderId?: string,
 *   status?: string,
 *   error?: string,
 *   code?: string,
 *   statusCode: number
 * }>}
 */
export async function createCheckoutOrder({
  token,
  supabaseClient,
  payPalConfig = null,
}) {
  // 1. Validate public token format
  if (!isValidPaymentTokenFormat(token)) {
    return {
      success: false,
      error: "Payment link is invalid or has expired.",
      code: "INVALID_TOKEN_FORMAT",
      statusCode: 404,
    };
  }

  const tokenHash = hashPaymentToken(token);

  // 2. Query active payment link and associated invoice
  const { data: linkRecord, error: linkError } = await supabaseClient
    .from("invoice_payment_links")
    .select(`
      id,
      invoice_id,
      expires_at,
      revoked_at,
      invoices (
        id,
        status,
        amount,
        currency,
        description
      )
    `)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkError || !linkRecord) {
    return {
      success: false,
      error: "Payment link is invalid or has expired.",
      code: "LINK_NOT_FOUND",
      statusCode: 404,
    };
  }

  if (linkRecord.revoked_at !== null) {
    return {
      success: false,
      error: "Payment link has been revoked.",
      code: "LINK_REVOKED",
      statusCode: 404,
    };
  }

  if (new Date(linkRecord.expires_at) <= new Date()) {
    return {
      success: false,
      error: "Payment link has expired.",
      code: "LINK_EXPIRED",
      statusCode: 404,
    };
  }

  const invoice = linkRecord.invoices;
  if (!invoice) {
    return {
      success: false,
      error: "Associated invoice record not found.",
      code: "INVOICE_NOT_FOUND",
      statusCode: 404,
    };
  }

  if (invoice.status === "PAID") {
    return {
      success: false,
      error: "This invoice has already been settled.",
      code: "INVOICE_ALREADY_PAID",
      statusCode: 409,
    };
  }

  if (invoice.status === "CANCELLED") {
    return {
      success: false,
      error: "This invoice is no longer active.",
      code: "INVOICE_CANCELLED",
      statusCode: 409,
    };
  }

  if (invoice.status !== "PENDING" && invoice.status !== "OVERDUE") {
    return {
      success: false,
      error: `Invoice cannot accept payments in status ${invoice.status}.`,
      code: "INVALID_INVOICE_STATUS",
      statusCode: 409,
    };
  }

  // 3. Atomically reserve payment attempt via PostgreSQL RPC
  const { data: attemptResult, error: attemptError } = await supabaseClient.rpc(
    "reserve_payment_attempt",
    { p_invoice_id: invoice.id }
  );

  if (attemptError) {
    return {
      success: false,
      error: "Failed to reserve payment attempt.",
      code: "DATABASE_RPC_ERROR",
      statusCode: 500,
    };
  }

  if (!attemptResult || !attemptResult.success) {
    const code = attemptResult?.code || "ATTEMPT_RESERVATION_FAILED";
    const message = attemptResult?.message || "Could not reserve payment attempt.";
    let statusCode = 400;
    if (code === "INVOICE_ALREADY_PAID" || code === "INVALID_INVOICE_STATUS") statusCode = 409;
    else if (code === "INVOICE_NOT_FOUND") statusCode = 404;

    return {
      success: false,
      error: message,
      code,
      statusCode,
    };
  }

  const paymentId = attemptResult.payment_id;
  const currentStatus = attemptResult.status;
  const existingOrderId = attemptResult.paypal_order_id;
  const createRequestId = attemptResult.create_request_id;
  const authoritativeAmount = attemptResult.amount;
  const authoritativeCurrency = attemptResult.currency;

  // 4. Idempotency Check: If PayPal order is already attached, reuse without creating duplicate
  if (existingOrderId && (currentStatus === "ORDER_CREATED" || currentStatus === "APPROVED")) {
    return {
      success: true,
      paymentId,
      orderId: existingOrderId,
      status: currentStatus,
      statusCode: 200,
    };
  }

  // 5. Call PayPal Orders v2 Create API using strictly persisted amount and stable create_request_id
  let payPalOrder;
  try {
    payPalOrder = await createPayPalOrder({
      amount: authoritativeAmount,
      currency: authoritativeCurrency,
      requestId: createRequestId,
      invoiceId: invoice.id,
      description: invoice.description,
      config: payPalConfig,
    });
  } catch (err) {
    return {
      success: false,
      error: "Payment gateway error during order initialization. Please retry.",
      code: err.code || "PAYPAL_ORDER_CREATION_FAILED",
      statusCode: err.statusCode === 429 ? 429 : 502,
    };
  }

  if (!payPalOrder || !payPalOrder.orderId) {
    return {
      success: false,
      error: "Failed to obtain valid order from payment gateway.",
      code: "GATEWAY_RESPONSE_INVALID",
      statusCode: 502,
    };
  }

  // 6. Persist the PayPal order ID using safe conditional server-side database operation
  const { data: updatedPayment, error: persistError } = await supabaseClient
    .from("payments")
    .update({
      paypal_order_id: payPalOrder.orderId,
      status: "ORDER_CREATED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("status", "CREATED")
    .is("paypal_order_id", null)
    .select()
    .single();

  if (persistError || !updatedPayment) {
    // Check if another concurrent request already attached the order ID
    const { data: existingCheck } = await supabaseClient
      .from("payments")
      .select("id, status, paypal_order_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (existingCheck && existingCheck.paypal_order_id) {
      return {
        success: true,
        paymentId: existingCheck.id,
        orderId: existingCheck.paypal_order_id,
        status: existingCheck.status,
        statusCode: 200,
      };
    }

    return {
      success: false,
      error: "Could not record payment order in database.",
      code: "ORDER_PERSISTENCE_FAILED",
      statusCode: 500,
    };
  }

  return {
    success: true,
    paymentId: updatedPayment.id,
    orderId: payPalOrder.orderId,
    status: "ORDER_CREATED",
    statusCode: 200,
  };
}
