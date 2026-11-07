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

  const clientId =
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_CLIENT_ID ||
    "";
  const currency = (process.env.PAYPAL_CURRENCY || "USD").trim().toUpperCase();
  const mode = (
    process.env.PAYPAL_MODE ||
    process.env.PAYPAL_ENVIRONMENT ||
    "sandbox"
  )
    .trim()
    .toLowerCase();

  return Response.json(
    {
      success: true,
      clientId,
      currency,
      mode,
      sandbox: mode === "sandbox",
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
