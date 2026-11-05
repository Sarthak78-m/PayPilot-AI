import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { lookupPublicInvoice } from "@/lib/payments/payment-link-service";
import { generatePaymentToken } from "@/lib/payments/payment-token";
import { createMockDatabase } from "../helpers/mock-database";

describe("Public Invoice Lookup (Tests 9–15)", () => {
  let db;

  beforeEach(() => {
    db = createMockDatabase();
  });

  it("9. Valid token returns permitted customer invoice fields", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({
      id: crypto.randomUUID(),
      customer_name: "Acme Widgets",
      description: "Q4 Retainer Services",
      amount: 1500.0,
      currency: "USD",
      due_date: "2026-12-15",
      status: "PENDING",
    });

    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    });

    const res = await lookupPublicInvoice({ token, supabaseClient: db.client });

    assert.equal(res.success, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.customerName, "Acme Widgets");
    assert.equal(res.data.description, "Q4 Retainer Services");
    assert.equal(res.data.amount, 1500.0);
    assert.equal(res.data.currency, "USD");
    assert.equal(res.data.dueDate, "2026-12-15");
    assert.equal(res.data.status, "PENDING");
    assert.ok(res.data.expiresAt);
  });

  it("10. Invalid token rejected (both malformed token and non-existent token)", async () => {
    // Malformed token format (not 43-char base64url)
    const malformedRes = await lookupPublicInvoice({
      token: "short-token-invalid",
      supabaseClient: db.client,
    });
    assert.equal(malformedRes.success, false);
    assert.equal(malformedRes.statusCode, 404);

    // Well-formed but non-existent token
    const { token } = generatePaymentToken();
    const unknownRes = await lookupPublicInvoice({
      token,
      supabaseClient: db.client,
    });
    assert.equal(unknownRes.success, false);
    assert.equal(unknownRes.statusCode, 404);
  });

  it("11. Expired token rejected", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });

    // Link expired 1 day ago
    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    });

    const res = await lookupPublicInvoice({ token, supabaseClient: db.client });
    assert.equal(res.success, false);
    assert.equal(res.statusCode, 404);
    assert.equal(res.code, "LINK_EXPIRED");
  });

  it("12. Revoked token rejected", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PENDING" });

    // Link explicitly revoked
    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
      revoked_at: new Date().toISOString(),
    });

    const res = await lookupPublicInvoice({ token, supabaseClient: db.client });
    assert.equal(res.success, false);
    assert.equal(res.statusCode, 404);
    assert.equal(res.code, "LINK_REVOKED");
  });

  it("13. PAID invoice rejected from public payment lookup", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "PAID" });

    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
    });

    const res = await lookupPublicInvoice({ token, supabaseClient: db.client });
    assert.equal(res.success, false);
    assert.equal(res.statusCode, 409);
    assert.equal(res.code, "INVOICE_ALREADY_PAID");
  });

  it("14. CANCELLED invoice rejected from public payment lookup", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const invoice = db.seedInvoice({ id: crypto.randomUUID(), status: "CANCELLED" });

    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
    });

    const res = await lookupPublicInvoice({ token, supabaseClient: db.client });
    assert.equal(res.success, false);
    assert.equal(res.statusCode, 409);
    assert.equal(res.code, "INVOICE_CANCELLED");
  });

  it("15. Internal merchant and payment fields are never exposed in public response", async () => {
    const { token, tokenHash } = generatePaymentToken();
    const secretUserId = "secret-merchant-uuid-999";
    const internalInvoiceId = crypto.randomUUID();

    const invoice = db.seedInvoice({
      id: internalInvoiceId,
      user_id: secretUserId,
      status: "PENDING",
    });

    db.seedPaymentLink({
      invoice_id: invoice.id,
      token_hash: tokenHash,
    });

    const res = await lookupPublicInvoice({ token, supabaseClient: db.client });
    assert.equal(res.success, true);

    const serialized = JSON.stringify(res.data);
    assert.equal(serialized.includes(secretUserId), false, "user_id must not leak");
    assert.equal(serialized.includes(internalInvoiceId), false, "invoice_id must not leak");
    assert.equal(serialized.includes(tokenHash), false, "token_hash must not leak");

    const allowedKeys = new Set([
      "customerName",
      "description",
      "amount",
      "currency",
      "dueDate",
      "status",
      "expiresAt",
    ]);

    for (const key of Object.keys(res.data)) {
      assert.ok(allowedKeys.has(key), `Disallowed field in public payload: ${key}`);
    }
  });
});
