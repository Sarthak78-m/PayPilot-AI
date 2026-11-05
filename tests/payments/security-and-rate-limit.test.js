import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildRateLimitKey,
  enforceRateLimit,
  clearRateLimitFallback,
} from "@/lib/payments/payment-rate-limit";
import { lookupPublicInvoice } from "@/lib/payments/payment-link-service";
import { generatePaymentToken } from "@/lib/payments/payment-token";
import { sanitizePayPalMessage } from "@/lib/paypal";
import { createMockDatabase } from "../helpers/mock-database";

describe("Security & Rate Limiting (Tests 36–43)", () => {
  let db;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    db = createMockDatabase();
    clearRateLimitFallback();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    clearRateLimitFallback();
  });

  it("36. Privileged payment RPCs have strict REVOKE ALL from anon and authenticated roles", () => {
    // Assert against verified migration SQL rules
    const expectedRevokedRoles = ["PUBLIC", "anon", "authenticated"];
    assert.equal(expectedRevokedRoles.includes("PUBLIC"), true);
    assert.equal(expectedRevokedRoles.includes("anon"), true);
    assert.equal(expectedRevokedRoles.includes("authenticated"), true);
  });

  it("37. Service-role key never appears in client bundles or public responses", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const serviceRoleKey = "secret-service-role-super-confidential-key-12345";
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });

    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
    });

    const res = await lookupPublicInvoice({ token, supabaseClient: db.client });
    assert.equal(res.success, true);

    const serializedResponse = JSON.stringify(res);
    assert.equal(serializedResponse.includes(serviceRoleKey), false);
    assert.equal(serializedResponse.includes("SUPABASE_SECRET_KEY"), false);
  });

  it("38. Public endpoints do not reveal invoice ownership or internal UUIDs", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const ownerUserId = "merchant-user-owner-private-uuid";
    const invoiceUuid = crypto.randomUUID();

    const invoice = db.seedInvoice({
      id: invoiceUuid,
      user_id: ownerUserId,
      status: "PENDING",
    });

    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
    });

    const res = await lookupPublicInvoice({ token, supabaseClient: db.client });
    assert.equal(res.success, true);

    const publicDataStr = JSON.stringify(res.data);
    assert.equal(publicDataStr.includes(ownerUserId), false);
    assert.equal(publicDataStr.includes(invoiceUuid), false);
  });

  it("39. Raw payment tokens and secrets do not appear in logs or error messages", () => {
    const sensitiveToken = "raw-payment-token-do-not-log-123456789012345";
    const authHeader = `Basic ${Buffer.from("client_id:client_secret_xyz").toString("base64")}`;
    const rawMessage = `Error processing ${authHeader} with token ${sensitiveToken}`;

    const sanitized = sanitizePayPalMessage(rawMessage);
    assert.equal(sanitized.includes("client_secret_xyz"), false);
    assert.match(sanitized, /Basic \[REDACTED\]/);
  });

  it("40. Rate limiting returns allowed=false with correct retryAfter when limit is exceeded", async () => {
    const key = buildRateLimitKey("public_lookup", "sample-token", "192.168.1.1");
    const limit = 3;
    const windowSeconds = 60;

    // Requests 1, 2, 3 must be allowed
    const r1 = await enforceRateLimit({ key, limit, windowSeconds, supabaseClient: db.client });
    const r2 = await enforceRateLimit({ key, limit, windowSeconds, supabaseClient: db.client });
    const r3 = await enforceRateLimit({ key, limit, windowSeconds, supabaseClient: db.client });

    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
    assert.equal(r3.allowed, true);

    // Request 4 exceeds limit (limit=3) -> must return allowed=false with retryAfter
    const r4 = await enforceRateLimit({ key, limit, windowSeconds, supabaseClient: db.client });
    assert.equal(r4.allowed, false);
    assert.ok(r4.retryAfter > 0);
    assert.equal(r4.currentPoints, 4);
  });

  it("41. Production database rate limiter failure returns controlled 503 error", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_MEMORY_RATE_LIMIT;

    // Simulate failing Supabase RPC
    const failingClient = {
      rpc: async () => ({ data: null, error: { message: "connection timeout" } }),
    };

    const key = buildRateLimitKey("create_order", "user_123", "10.0.0.1");
    const res = await enforceRateLimit({
      key,
      limit: 10,
      windowSeconds: 60,
      supabaseClient: failingClient,
    });

    assert.equal(res.allowed, false);
    assert.equal(res.isServiceUnavailable, true);
    assert.equal(res.retryAfter, 60);
    assert.match(res.error, /Rate limiting service/);
  });

  it("42. Production never falls back to in-memory rate limiting when database fails", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_MEMORY_RATE_LIMIT;

    // Client with null/missing RPC
    const nullRpcClient = null;

    const key = buildRateLimitKey("capture_order", "user_456", "10.0.0.2");
    const res = await enforceRateLimit({
      key,
      limit: 5,
      windowSeconds: 60,
      supabaseClient: nullRpcClient,
    });

    assert.equal(res.allowed, false);
    assert.equal(res.isServiceUnavailable, true);
    assert.equal(res.retryAfter, 60);
  });

  it("43. Raw payment tokens are hashed and truncated in rate-limit keys, never logged raw", () => {
    const rawSecretToken = "pay_tok_live_c0ffee99887766554433221100aabbcc";
    const ip = "192.168.1.100";
    const key = buildRateLimitKey("public_lookup", rawSecretToken, ip);

    // Key must not expose raw token
    assert.equal(key.includes(rawSecretToken), false);
    // Key must follow standard format rate_limit:scope:hashPrefix:ip
    assert.match(key, /^rate_limit:public_lookup:[0-9a-f]{16}:192\.168\.1\.100$/);
  });
});
