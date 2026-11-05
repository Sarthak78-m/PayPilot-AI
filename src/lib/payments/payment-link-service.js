import "server-only";

import {
  generatePaymentToken,
  hashPaymentToken,
  isValidPaymentTokenFormat,
} from "./payment-token";
import {
  isValidUUID,
  validateExpiryDays,
  calculateExpirationDate,
} from "./payment-validation";

/**
 * Resolves application base URL for generating customer checkout links.
 *
 * @param {Request} [request] - Next.js Request object for fallback origin.
 * @returns {string} Fully qualified base URL without trailing slash.
 */
export function getAppBaseUrl(request) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  if (request && typeof request.headers?.get === "function") {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "http";
    if (host) {
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  }

  return "http://localhost:3000";
}

/**
 * Generates or regenerates a cryptographically secure public payment link for an invoice.
 * Invokes the privileged PostgreSQL RPC public.create_or_regenerate_payment_link.
 *
 * @param {object} params
 * @param {string} params.invoiceId - Target invoice UUID.
 * @param {object} params.user - Authenticated merchant user object (contains user.id).
 * @param {number} [params.expiresInDays=7] - Link validity in days (1-30).
 * @param {boolean} [params.allowDraftTransition=false] - Whether to transition DRAFT to PENDING.
 * @param {object} params.supabaseClient - Trusted service-role Supabase client.
 * @param {Request} [params.request] - Optional request for base URL resolution.
 * @returns {Promise<{
 *   success: boolean,
 *   paymentUrl?: string,
 *   expiresAt?: string,
 *   error?: string,
 *   code?: string,
 *   statusCode: number
 * }>}
 */
export async function generateMerchantPaymentLink({
  invoiceId,
  user,
  expiresInDays = 7,
  allowDraftTransition = false,
  supabaseClient,
  request,
}) {
  if (!user || !user.id) {
    return {
      success: false,
      error: "Authentication is required.",
      code: "UNAUTHORIZED",
      statusCode: 401,
    };
  }

  if (!isValidUUID(invoiceId)) {
    return {
      success: false,
      error: "Invalid invoice ID format.",
      code: "INVALID_INVOICE_ID",
      statusCode: 400,
    };
  }

  const expiryValidation = validateExpiryDays(expiresInDays);
  if (!expiryValidation.valid) {
    return {
      success: false,
      error: expiryValidation.error,
      code: "INVALID_EXPIRY_DAYS",
      statusCode: 400,
    };
  }

  const expiresAt = calculateExpirationDate(expiryValidation.days);

  // 1. Generate 256-bit CSPRNG token and SHA-256 hash
  const { token, tokenHash } = generatePaymentToken();

  // 2. Call privileged RPC public.create_or_regenerate_payment_link
  const { data: rpcResult, error: rpcError } = await supabaseClient.rpc(
    "create_or_regenerate_payment_link",
    {
      p_invoice_id: invoiceId,
      p_user_id: user.id,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_allow_draft_transition: Boolean(allowDraftTransition),
    }
  );

  if (rpcError) {
    return {
      success: false,
      error: "Failed to create payment link in database.",
      code: "DATABASE_RPC_ERROR",
      statusCode: 500,
    };
  }

  if (!rpcResult || !rpcResult.success) {
    const code = rpcResult?.code || "LINK_GENERATION_FAILED";
    const message = rpcResult?.message || "Failed to generate payment link.";

    let statusCode = 400;
    if (code === "INVOICE_NOT_FOUND") statusCode = 404;
    else if (code === "FORBIDDEN") statusCode = 403;
    else if (code === "DRAFT_INVOICE_NOT_ISSUED" || code === "INVALID_INVOICE_STATUS") statusCode = 409;

    return {
      success: false,
      error: message,
      code,
      statusCode,
    };
  }

  // 3. Construct public payment URL with the raw public token (never persisted or logged)
  const baseUrl = getAppBaseUrl(request);
  const paymentUrl = `${baseUrl}/pay/${token}`;

  return {
    success: true,
    paymentUrl,
    expiresAt: rpcResult.expires_at || expiresAt,
    statusCode: 200,
  };
}

/**
 * Looks up and returns minimal customer-facing payment details for a public payment link.
 * Validates token format, SHA-256 hash match, expiration, revocation, and invoice state.
 *
 * @param {object} params
 * @param {string} params.token - Public Base64URL token.
 * @param {object} params.supabaseClient - Trusted service-role Supabase client.
 * @returns {Promise<{
 *   success: boolean,
 *   data?: {
 *     customerName: string,
 *     description: string,
 *     amount: number,
 *     currency: string,
 *     dueDate: string,
 *     status: string,
 *     expiresAt: string
 *   },
 *   error?: string,
 *   code?: string,
 *   statusCode: number
 * }>}
 */
export async function lookupPublicInvoice({ token, supabaseClient }) {
  if (!isValidPaymentTokenFormat(token)) {
    return {
      success: false,
      error: "Payment link is invalid or has expired.",
      code: "INVALID_TOKEN_FORMAT",
      statusCode: 404,
    };
  }

  const tokenHash = hashPaymentToken(token);

  // Query payment link record and join invoice
  const { data: linkRecord, error: queryError } = await supabaseClient
    .from("invoice_payment_links")
    .select(`
      id,
      invoice_id,
      expires_at,
      revoked_at,
      invoices (
        id,
        customer_name,
        description,
        amount,
        currency,
        due_date,
        status
      )
    `)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (queryError || !linkRecord) {
    return {
      success: false,
      error: "Payment link is invalid or has expired.",
      code: "LINK_NOT_FOUND",
      statusCode: 404,
    };
  }

  // Check link revocation
  if (linkRecord.revoked_at !== null) {
    return {
      success: false,
      error: "Payment link is invalid or has expired.",
      code: "LINK_REVOKED",
      statusCode: 404,
    };
  }

  // Check link expiration
  if (new Date(linkRecord.expires_at) <= new Date()) {
    return {
      success: false,
      error: "Payment link is invalid or has expired.",
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

  // Reject non-payable invoice states (PAID, CANCELLED, DRAFT)
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
      error: "Invoice is not available for online payment.",
      code: "INVALID_INVOICE_STATUS",
      statusCode: 409,
    };
  }

  // Touch last_accessed_at in the background (fire-and-forget safe)
  try {
    await supabaseClient
      .from("invoice_payment_links")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", linkRecord.id);
  } catch {
    // Non-blocking
  }

  // Return strictly permitted customer-facing fields
  return {
    success: true,
    data: {
      customerName: invoice.customer_name || "",
      description: invoice.description || "",
      amount: Number(invoice.amount),
      currency: invoice.currency,
      dueDate: invoice.due_date,
      status: invoice.status,
      expiresAt: linkRecord.expires_at,
    },
    statusCode: 200,
  };
}
