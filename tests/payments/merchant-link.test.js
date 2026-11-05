import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { generateMerchantPaymentLink } from "@/lib/payments/payment-link-service";
import { createMockDatabase } from "../helpers/mock-database";

describe("Merchant Payment Link Generation (Tests 1–8)", () => {
  let db;
  const merchantUser = { id: crypto.randomUUID() };
  const attackerUser = { id: crypto.randomUUID() };

  beforeEach(() => {
    db = createMockDatabase();
  });

  it("1. Authenticated merchant can generate a link for their invoice", async () => {
    const invoice = db.seedInvoice({
      id: crypto.randomUUID(),
      user_id: merchantUser.id,
      status: "PENDING",
      amount: 120.0,
      currency: "USD",
    });

    const res = await generateMerchantPaymentLink({
      invoiceId: invoice.id,
      user: merchantUser,
      expiresInDays: 7,
      supabaseClient: db.client,
    });

    assert.equal(res.success, true);
    assert.equal(res.statusCode, 200);
    assert.match(res.paymentUrl, /\/pay\/[A-Za-z0-9_-]{43}$/);
    assert.ok(res.expiresAt);
  });

  it("2. Unauthenticated merchant receives 401", async () => {
    const res = await generateMerchantPaymentLink({
      invoiceId: crypto.randomUUID(),
      user: null,
      supabaseClient: db.client,
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.code, "UNAUTHORIZED");
  });

  it("3. Merchant cannot create a link for another user's invoice", async () => {
    const invoice = db.seedInvoice({
      id: crypto.randomUUID(),
      user_id: merchantUser.id,
      status: "PENDING",
    });

    const res = await generateMerchantPaymentLink({
      invoiceId: invoice.id,
      user: attackerUser,
      supabaseClient: db.client,
    });

    assert.equal(res.success, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.code, "FORBIDDEN");
  });

  it("4. DRAFT transition follows the explicit flag", async () => {
    const draftInvoice = db.seedInvoice({
      id: crypto.randomUUID(),
      user_id: merchantUser.id,
      status: "DRAFT",
    });

    // 4a: Without allowDraftTransition flag -> rejected
    const rejectedRes = await generateMerchantPaymentLink({
      invoiceId: draftInvoice.id,
      user: merchantUser,
      allowDraftTransition: false,
      supabaseClient: db.client,
    });
    assert.equal(rejectedRes.success, false);
    assert.equal(rejectedRes.code, "DRAFT_INVOICE_NOT_ISSUED");

    // 4b: With allowDraftTransition: true -> transitions to PENDING and succeeds
    const allowedRes = await generateMerchantPaymentLink({
      invoiceId: draftInvoice.id,
      user: merchantUser,
      allowDraftTransition: true,
      supabaseClient: db.client,
    });
    assert.equal(allowedRes.success, true);
    assert.equal(db.invoices.get(draftInvoice.id).status, "PENDING");
  });

  it("5. PAID invoice is rejected", async () => {
    const paidInvoice = db.seedInvoice({
      id: crypto.randomUUID(),
      user_id: merchantUser.id,
      status: "PAID",
    });

    const res = await generateMerchantPaymentLink({
      invoiceId: paidInvoice.id,
      user: merchantUser,
      supabaseClient: db.client,
    });

    assert.equal(res.success, false);
    assert.equal(res.code, "INVALID_INVOICE_STATUS");
  });

  it("6. CANCELLED invoice is rejected", async () => {
    const cancelledInvoice = db.seedInvoice({
      id: crypto.randomUUID(),
      user_id: merchantUser.id,
      status: "CANCELLED",
    });

    const res = await generateMerchantPaymentLink({
      invoiceId: cancelledInvoice.id,
      user: merchantUser,
      supabaseClient: db.client,
    });

    assert.equal(res.success, false);
    assert.equal(res.code, "INVALID_INVOICE_STATUS");
  });

  it("7. Expired-link regeneration succeeds and revokes previous link", async () => {
    const invoice = db.seedInvoice({
      id: crypto.randomUUID(),
      user_id: merchantUser.id,
      status: "PENDING",
    });

    // Generate first link
    const firstRes = await generateMerchantPaymentLink({
      invoiceId: invoice.id,
      user: merchantUser,
      supabaseClient: db.client,
    });
    assert.equal(firstRes.success, true);

    const linksAfterFirst = [...db.invoicePaymentLinks.values()].filter(
      (l) => l.invoice_id === invoice.id && l.revoked_at === null
    );
    assert.equal(linksAfterFirst.length, 1);
    const firstLinkId = linksAfterFirst[0].id;

    // Generate second link (regenerate)
    const secondRes = await generateMerchantPaymentLink({
      invoiceId: invoice.id,
      user: merchantUser,
      supabaseClient: db.client,
    });
    assert.equal(secondRes.success, true);

    // Old link must be revoked
    assert.ok(db.invoicePaymentLinks.get(firstLinkId).revoked_at !== null);

    // Only one active link remains
    const activeLinks = [...db.invoicePaymentLinks.values()].filter(
      (l) => l.invoice_id === invoice.id && l.revoked_at === null
    );
    assert.equal(activeLinks.length, 1);
    assert.notEqual(activeLinks[0].id, firstLinkId);
  });

  it("8. Raw token is never persisted in database (only 64-char SHA-256 hash is stored)", async () => {
    const invoice = db.seedInvoice({
      id: crypto.randomUUID(),
      user_id: merchantUser.id,
      status: "PENDING",
    });

    const res = await generateMerchantPaymentLink({
      invoiceId: invoice.id,
      user: merchantUser,
      supabaseClient: db.client,
    });

    assert.equal(res.success, true);

    const tokenMatch = res.paymentUrl.match(/\/pay\/([A-Za-z0-9_-]+)$/);
    assert.ok(tokenMatch);
    const rawPublicToken = tokenMatch[1];

    for (const link of db.invoicePaymentLinks.values()) {
      // Must not match raw token
      assert.notEqual(link.token_hash, rawPublicToken);
      // Stored hash must strictly be 64-character lowercase hexadecimal
      assert.match(link.token_hash, /^[0-9a-f]{64}$/);
      assert.equal(typeof link.raw_token, "undefined");
    }
  });
});
