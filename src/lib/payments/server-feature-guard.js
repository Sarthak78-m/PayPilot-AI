import "server-only";

/**
 * Server-Side Payment Checkout Feature Guard
 *
 * Checks process.env.PAYMENT_CHECKOUT_ENABLED.
 * Defaults strictly to false when missing or not set to "true".
 *
 * Never import this file into client components or client bundles.
 */

export function isServerPaymentCheckoutEnabled() {
  return process.env.PAYMENT_CHECKOUT_ENABLED === "true";
}

/**
 * Returns an HTTP 503 Service Unavailable Response if payment checkout is disabled on the server.
 * Returns null if payment checkout is enabled.
 *
 * @returns {Response|null}
 */
export function checkServerPaymentFeatureGuard() {
  if (!isServerPaymentCheckoutEnabled()) {
    return Response.json(
      {
        success: false,
        error: "Payment checkout system is temporarily unavailable. Feature is disabled on the server.",
        code: "PAYMENT_FEATURE_DISABLED",
      },
      {
        status: 503,
        headers: {
          "Retry-After": "300",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
  return null;
}
