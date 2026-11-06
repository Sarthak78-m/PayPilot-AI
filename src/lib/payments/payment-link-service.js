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
 * Helper to check if a hostname is localhost / loopback.
 * @param {string} host
 * @returns {boolean}
 */
export function isLocalhostHost(host) {
  if (!host) return false;
  const cleanHost = host.split(":")[0].toLowerCase();
  return cleanHost === "localhost" || cleanHost === "127.0.0.1" || cleanHost === "[::1]" || cleanHost === "::1";
}

/**
 * Validates whether a hostname belongs to explicitly permitted deployment domains.
 *
 * @param {string} hostWithPort
 * @returns {boolean}
 */
export function isPermittedHost(hostWithPort) {
  if (!hostWithPort || typeof hostWithPort !== "string") return false;
  // Disallow control characters, spaces, userinfo (@), or path separators
  if (/[/@\s\\<>]/.test(hostWithPort)) return false;

  const hostname = hostWithPort.split(":")[0].toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  // 1. Localhost is permitted ONLY in non-production environments
  if (isLocalhostHost(hostname)) {
    return !isProduction;
  }

  // 2. Allow host from configured NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL
  const configuredUrls = [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL].filter(Boolean);
  for (const urlStr of configuredUrls) {
    try {
      const parsed = new URL(urlStr);
      if (parsed.hostname.toLowerCase() === hostname) {
        return true;
      }
    } catch {
      // Ignore invalid configured URLs
    }
  }

  // 3. Allow explicit ALLOWED_HOSTS / ALLOWED_ORIGINS (comma-separated list)
  const allowedHostsEnv = process.env.ALLOWED_HOSTS || process.env.ALLOWED_ORIGINS;
  if (allowedHostsEnv) {
    const list = allowedHostsEnv.split(",").map((h) => h.trim().toLowerCase());
    if (list.includes(hostname) || list.includes(hostWithPort.toLowerCase())) {
      return true;
    }
  }

  // 4. Allow PayPilot production domains and subdomains
  if (
    hostname === "paypilot.ai" ||
    hostname.endsWith(".paypilot.ai") ||
    hostname === "paypilot.com" ||
    hostname.endsWith(".paypilot.com")
  ) {
    return true;
  }

  // 5. Allow Vercel preview and deployment domains (*.vercel.app)
  if (/^[a-zA-Z0-9_-]+\.vercel\.app$/i.test(hostname)) {
    return true;
  }

  // Reject all other arbitrary external hosts
  return false;
}

/**
 * Resolves application base URL for generating customer checkout links.
 * Enforces production origin security, rejecting arbitrary hosts and protocols.
 *
 * @param {Request} [request] - Next.js Request object for fallback origin.
 * @returns {string} Fully qualified base URL without trailing slash.
 */
export function getAppBaseUrl(request) {
  const isProduction = process.env.NODE_ENV === "production";

  // 1. Prefer fixed configured application origin (NEXT_PUBLIC_SITE_URL)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && typeof siteUrl === "string" && siteUrl.trim()) {
    try {
      const parsed = new URL(siteUrl.trim());
      if (parsed.protocol === "https:" || (!isProduction && parsed.protocol === "http:" && isLocalhostHost(parsed.hostname))) {
        return siteUrl.trim().replace(/\/+$/, "");
      }
    } catch {
      // Malformed URL, fall through
    }
  }

  // 2. Fall back to NEXT_PUBLIC_APP_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && typeof appUrl === "string" && appUrl.trim()) {
    try {
      const parsed = new URL(appUrl.trim());
      if (parsed.protocol === "https:" || (!isProduction && parsed.protocol === "http:" && isLocalhostHost(parsed.hostname))) {
        return appUrl.trim().replace(/\/+$/, "");
      }
    } catch {
      // Malformed URL, fall through
    }
  }

  // 3. Fall back to validated Vercel deployment URL
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && typeof vercelUrl === "string" && vercelUrl.trim()) {
    const cleanVercel = vercelUrl.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (/^[a-zA-Z0-9_.-]+$/.test(cleanVercel) && (cleanVercel.endsWith(".vercel.app") || isPermittedHost(cleanVercel))) {
      return `https://${cleanVercel}`;
    }
  }

  // 4. Request header evaluation (X-Forwarded-Host / Host)
  if (request && typeof request.headers?.get === "function") {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const rawHost = forwardedHost || request.headers.get("host");

    if (rawHost && typeof rawHost === "string") {
      // If multiple hosts provided (e.g. "evil.com, good.com"), inspect the first host
      const hostCandidate = rawHost.split(",")[0].trim();

      if (isPermittedHost(hostCandidate)) {
        const protoHeader = (request.headers.get("x-forwarded-proto") || "https").toLowerCase().trim();
        const hostname = hostCandidate.split(":")[0].toLowerCase();
        const isLocal = isLocalhostHost(hostname);

        // Protocol enforcement:
        // Localhost in dev may use http or https; all remote hosts MUST use https
        if (isLocal) {
          const proto = protoHeader === "https" ? "https" : "http";
          return `${proto}://${hostCandidate}`.replace(/\/+$/, "");
        } else if (protoHeader === "https" || protoHeader === "http") {
          // Reject non-http/https protocols; enforce https for remote hosts
          return `https://${hostCandidate}`.replace(/\/+$/, "");
        }
      }
    }
  }

  // 5. Fallback behavior
  if (isProduction) {
    throw new Error(
      "Payment link generation failed: Localhost payment links cannot be generated in production. " +
      "Configure NEXT_PUBLIC_SITE_URL or ensure a valid Vercel deployment URL is set."
    );
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
  let baseUrl;
  try {
    baseUrl = getAppBaseUrl(request);
  } catch (urlErr) {
    return {
      success: false,
      error: urlErr.message || "Invalid payment link origin configuration.",
      code: "INVALID_ORIGIN_CONFIGURATION",
      statusCode: 500,
    };
  }
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
