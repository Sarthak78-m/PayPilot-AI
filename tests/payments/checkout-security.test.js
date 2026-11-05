import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { POST as createOrderPost } from "@/app/api/payments/create-order/route.js";
import { POST as captureOrderPost } from "@/app/api/payments/capture-order/route.js";
import { GET as publicInvoiceLookupGet } from "@/app/api/public/invoices/[token]/route.js";
import { POST as merchantPaymentLinkPost } from "@/app/api/invoices/[id]/payment-link/route.js";
import { metadata as publicLayoutMetadata } from "@/app/pay/[token]/layout.js";
import { isServerPaymentCheckoutEnabled, checkServerPaymentFeatureGuard } from "@/lib/payments/server-feature-guard.js";

/**
 * Phase 7B.3.1: Server-Side Payment Feature Guard & Security Verification
 */
describe("Phase 7B.3.1 Payment Security & Server Feature Guard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("1. Server feature guard defaults strictly to disabled when PAYMENT_CHECKOUT_ENABLED is missing or false", () => {
    delete process.env.PAYMENT_CHECKOUT_ENABLED;
    assert.equal(isServerPaymentCheckoutEnabled(), false);

    const guardRes = checkServerPaymentFeatureGuard();
    assert.ok(guardRes);
    assert.equal(guardRes.status, 503);

    process.env.PAYMENT_CHECKOUT_ENABLED = "false";
    assert.equal(isServerPaymentCheckoutEnabled(), false);

    process.env.PAYMENT_CHECKOUT_ENABLED = "true";
    assert.equal(isServerPaymentCheckoutEnabled(), true);
    assert.equal(checkServerPaymentFeatureGuard(), null);
  });

  it("2. Direct API call to create-order returns HTTP 503 when disabled", async () => {
    delete process.env.PAYMENT_CHECKOUT_ENABLED;

    const req = new Request("http://localhost:3000/api/payments/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "test-sample-payment-token-43chars" }),
    });

    const res = await createOrderPost(req);
    assert.equal(res.status, 503);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, "PAYMENT_FEATURE_DISABLED");
    assert.ok(body.error.includes("temporarily unavailable"));
  });

  it("3. Direct API call to capture-order returns HTTP 503 when disabled", async () => {
    delete process.env.PAYMENT_CHECKOUT_ENABLED;

    const req = new Request("http://localhost:3000/api/payments/capture-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "test-token", orderId: "PAYPAL-ORDER-123" }),
    });

    const res = await captureOrderPost(req);
    assert.equal(res.status, 503);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, "PAYMENT_FEATURE_DISABLED");
  });

  it("4. Direct public lookup follows the intended disabled behavior and returns HTTP 503", async () => {
    delete process.env.PAYMENT_CHECKOUT_ENABLED;

    const req = new Request("http://localhost:3000/api/public/invoices/test-token", {
      method: "GET",
    });

    const res = await publicInvoiceLookupGet(req, {
      params: Promise.resolve({ token: "test-token" }),
    });

    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, "PAYMENT_FEATURE_DISABLED");
  });

  it("5. Merchant link generation cannot mutate database while disabled", async () => {
    delete process.env.PAYMENT_CHECKOUT_ENABLED;

    const req = new Request("http://localhost:3000/api/invoices/inv-123/payment-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowDraftTransition: true, expiresInDays: 7 }),
    });

    const res = await merchantPaymentLinkPost(req, {
      params: Promise.resolve({ id: "inv-123" }),
    });

    assert.equal(res.status, 503);

    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, "PAYMENT_FEATURE_DISABLED");
  });

  it("6. Server feature flag PAYMENT_CHECKOUT_ENABLED is never exposed to client bundles", () => {
    // Inspect client feature guard file: must only access NEXT_PUBLIC variables
    const clientGuardSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/payments/feature-guard.js"),
      "utf8"
    );

    assert.ok(
      !clientGuardSource.includes("process.env.PAYMENT_CHECKOUT_ENABLED"),
      "Client feature guard must not reference server-only PAYMENT_CHECKOUT_ENABLED"
    );

    // Inspect server feature guard file: must have import "server-only"
    const serverGuardSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/payments/server-feature-guard.js"),
      "utf8"
    );

    assert.ok(
      serverGuardSource.includes('import "server-only"'),
      "Server feature guard must enforce server-only isolation"
    );
  });

  it("7. Referrer policy is strictly set to no-referrer on public payment views and APIs", () => {
    assert.equal(
      publicLayoutMetadata.referrer,
      "no-referrer",
      "Public checkout layout metadata must specify referrer: 'no-referrer'"
    );

    const nextConfigSource = fs.readFileSync(
      path.resolve(process.cwd(), "next.config.mjs"),
      "utf8"
    );

    assert.ok(
      nextConfigSource.includes('"Referrer-Policy"'),
      "next.config.mjs must declare Referrer-Policy header"
    );
    assert.ok(
      nextConfigSource.includes('"no-referrer"'),
      "next.config.mjs must enforce no-referrer"
    );
  });
});
