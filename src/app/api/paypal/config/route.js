import { checkServerPaymentFeatureGuard } from "@/lib/payments/server-feature-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/paypal/config
 *
 * Returns safe public configuration required to initialize the official PayPal JavaScript SDK:
 * - Public Client ID
 * - Configured Currency
 * - Gateway Mode (sandbox | production)
 * - Checkout Enabled state
 *
 * Never exposes the client secret or internal credentials.
 */
export async function GET() {
  const guardResponse = checkServerPaymentFeatureGuard();
  if (guardResponse) {
    return guardResponse;
  }

  const sanitize = (val) => (typeof val === "string" ? val.trim().replace(/^["']|["']$/g, "").trim() : "");
  const clientId = sanitize(
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_CLIENT_ID ||
    ""
  );
  const hasClientSecret = Boolean(
    sanitize(process.env.PAYPAL_CLIENT_SECRET)
  );
  const currency = (sanitize(process.env.PAYPAL_CURRENCY) || "USD").toUpperCase();
  const mode = (
    sanitize(process.env.PAYPAL_MODE || process.env.PAYPAL_ENVIRONMENT) ||
    "sandbox"
  ).toLowerCase();

  return Response.json(
    {
      success: true,
      clientId,
      currency,
      mode,
      sandbox: mode === "sandbox",
      hasClientSecret,
      configured: Boolean(clientId && hasClientSecret),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Referrer-Policy": "no-referrer",
      },
    }
  );
}
