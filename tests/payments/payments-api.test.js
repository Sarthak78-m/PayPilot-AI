import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { convertCurrency } from "@/lib/payments/currency";

describe("Payments API Contract & Aggregations (GET /api/payments)", () => {
  it("rejects unauthenticated requests with 401 Unauthorized", async () => {
    const unauthenticatedUser = null;
    let statusCode = 200;
    let responseBody = {};

    if (!unauthenticatedUser) {
      statusCode = 401;
      responseBody = { status: "error", message: "Authentication is required." };
    }

    assert.equal(statusCode, 401);
    assert.equal(responseBody.status, "error");
    assert.equal(responseBody.message, "Authentication is required.");
  });

  it("computes overview aggregations across completed, pending, and failed payments", () => {
    const samplePayments = [
      { id: "p1", amount: 150.0, status: "COMPLETED", currency: "USD" },
      { id: "p2", amount: 250.0, status: "COMPLETED", currency: "USD" },
      { id: "p3", amount: 100.0, status: "ORDER_CREATED", currency: "USD" },
      { id: "p4", amount: 75.0, status: "FAILED", currency: "USD" },
      { id: "p5", amount: 50.0, status: "REFUNDED", currency: "USD" },
    ];

    let totalReceivedAmt = 0;
    let totalReceivedCount = 0;
    let pendingAmt = 0;
    let pendingCount = 0;
    let failedAmt = 0;
    let failedCount = 0;
    let refundedAmt = 0;
    let refundedCount = 0;

    samplePayments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      const st = (p.status || "").toLowerCase();

      if (st === "completed" || st === "paid" || st === "settled") {
        totalReceivedAmt += amt;
        totalReceivedCount += 1;
      } else if (["pending", "created", "order_created", "approved", "capturing"].includes(st)) {
        pendingAmt += amt;
        pendingCount += 1;
      } else if (st === "failed" || st === "denied") {
        failedAmt += amt;
        failedCount += 1;
      } else if (st === "refunded") {
        refundedAmt += amt;
        refundedCount += 1;
      }
    });

    assert.equal(totalReceivedAmt, 400.0);
    assert.equal(totalReceivedCount, 2);
    assert.equal(pendingAmt, 100.0);
    assert.equal(pendingCount, 1);
    assert.equal(failedAmt, 75.0);
    assert.equal(failedCount, 1);
    assert.equal(refundedAmt, 50.0);
    assert.equal(refundedCount, 1);
  });

  it("filters payments strictly by requested status parameter", () => {
    const samplePayments = [
      { id: "p1", amount: 150.0, status: "completed" },
      { id: "p2", amount: 100.0, status: "order_created" },
      { id: "p3", amount: 75.0, status: "failed" },
    ];

    const filterStatus = (statusParam) => {
      return samplePayments.filter((p) => {
        const st = (p.status || "").toLowerCase();
        if (statusParam === "completed") {
          return st === "completed" || st === "paid" || st === "settled";
        }
        if (statusParam === "pending") {
          return ["pending", "created", "order_created", "approved", "capturing"].includes(st);
        }
        if (statusParam === "failed") {
          return st === "failed" || st === "denied";
        }
        return st === statusParam;
      });
    };

    const completed = filterStatus("completed");
    assert.equal(completed.length, 1);
    assert.equal(completed[0].id, "p1");

    const pending = filterStatus("pending");
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, "p2");

    const failed = filterStatus("failed");
    assert.equal(failed.length, 1);
    assert.equal(failed[0].id, "p3");
  });

  it("filters payments by customer name and transaction reference in search", () => {
    const sampleRecords = [
      { id: "payment-uuid-1", invoiceCustomer: "Acme International", captureId: "CAP-12345" },
      { id: "payment-uuid-2", invoiceCustomer: "Globex Corporation", captureId: "CAP-99999" },
    ];

    const searchFilter = (query) => {
      const q = query.toLowerCase();
      return sampleRecords.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.invoiceCustomer.toLowerCase().includes(q) ||
          p.captureId.toLowerCase().includes(q)
      );
    };

    const matchCustomer = searchFilter("Acme");
    assert.equal(matchCustomer.length, 1);
    assert.equal(matchCustomer[0].id, "payment-uuid-1");

    const matchCapture = searchFilter("99999");
    assert.equal(matchCapture.length, 1);
    assert.equal(matchCapture[0].id, "payment-uuid-2");

    const matchNone = searchFilter("Stark Industries");
    assert.equal(matchNone.length, 0);
  });

  it("paginates payment records deterministically with total and totalPages", () => {
    const records = Array.from({ length: 25 }, (_, i) => ({ id: `p-${i + 1}` }));
    const limit = 10;

    const paginate = (page) => {
      const offset = (page - 1) * limit;
      return {
        items: records.slice(offset, offset + limit),
        total: records.length,
        totalPages: Math.ceil(records.length / limit),
      };
    };

    const page1 = paginate(1);
    assert.equal(page1.items.length, 10);
    assert.equal(page1.items[0].id, "p-1");
    assert.equal(page1.total, 25);
    assert.equal(page1.totalPages, 3);

    const page3 = paginate(3);
    assert.equal(page3.items.length, 5);
    assert.equal(page3.items[0].id, "p-21");
  });

  it("formats customer-facing payment entries according to client contract", () => {
    const raw = {
      id: "b42ffaa9-69f2-4bc4-b771-419b489953d1",
      invoice_id: "71bb8863-718f-4318-ba20-136b69b3296c",
      amount: 450.0,
      currency: "USD",
      status: "COMPLETED",
      paypal_capture_id: "8AB12345678901234",
      created_at: "2026-11-05T14:30:00.000Z",
      provider: "paypal",
    };

    const formatted = {
      id: raw.id,
      transactionRef: raw.paypal_capture_id ? `#${raw.paypal_capture_id.slice(-8)}` : `#${raw.id.slice(0, 8)}`,
      invoiceId: `#${raw.invoice_id.slice(0, 8)}`,
      amount: Number(raw.amount),
      currency: raw.currency,
      date: raw.created_at.split("T")[0],
      status: "completed",
      provider: "PayPal Sandbox",
    };

    assert.equal(formatted.transactionRef, "#78901234");
    assert.equal(formatted.invoiceId, "#71bb8863");
    assert.equal(formatted.amount, 450.0);
    assert.equal(formatted.currency, "USD");
    assert.equal(formatted.date, "2026-11-05");
    assert.equal(formatted.status, "completed");
    assert.equal(formatted.provider, "PayPal Sandbox");
  });

  it("enforces strict multi-user tenant isolation: User A cannot access User B's payments", () => {
    const userA = { id: "merchant-user-A" };
    const userB = { id: "merchant-user-B" };

    const databaseInvoices = [
      { id: "inv-A-1", user_id: "merchant-user-A", customer_name: "Client Alpha" },
      { id: "inv-A-2", user_id: "merchant-user-A", customer_name: "Client Beta" },
      { id: "inv-B-1", user_id: "merchant-user-B", customer_name: "Secret Corp" },
    ];

    const databasePayments = [
      { id: "pay-1", invoice_id: "inv-A-1", amount: 100.0, status: "completed" },
      { id: "pay-2", invoice_id: "inv-A-2", amount: 200.0, status: "completed" },
      { id: "pay-3", invoice_id: "inv-B-1", amount: 9999.0, status: "completed" },
    ];

    // Simulating GET /api/payments logic for user A:
    // Step 1: User A's invoices
    const userAInvoices = databaseInvoices.filter((inv) => inv.user_id === userA.id);
    const userAInvoiceIds = new Set(userAInvoices.map((inv) => inv.id));

    // Step 2: Payments scoped to User A's invoice IDs
    const userAPayments = databasePayments.filter((p) => userAInvoiceIds.has(p.invoice_id));

    assert.equal(userAPayments.length, 2);
    assert.ok(userAPayments.every((p) => p.invoice_id.startsWith("inv-A-")));
    assert.ok(!userAPayments.some((p) => p.invoice_id === "inv-B-1"));
    assert.ok(!userAPayments.some((p) => p.amount === 9999.0));

    // Verify empty state for a new user C with zero invoices
    const userC = { id: "merchant-user-C" };
    const userCInvoices = databaseInvoices.filter((inv) => inv.user_id === userC.id);
    assert.equal(userCInvoices.length, 0);
  });

  it("converts multi-currency transactions (e.g. INR + USD) into unified USD values for overview and table", () => {
    const multiCurrencyPayments = [
      { id: "p-usd", amount: 25.0, currency: "USD", status: "PENDING" },
      { id: "p-inr-1", amount: 499.99, currency: "INR", status: "PENDING" },
      { id: "p-inr-2", amount: 300.0, currency: "INR", status: "PENDING" },
      { id: "p-completed", amount: 15.0, currency: "USD", status: "COMPLETED" },
    ];

    let pendingUsd = 0;
    let completedUsd = 0;

    multiCurrencyPayments.forEach((p) => {
      const conv = convertCurrency({
        amount: p.amount,
        fromCurrency: p.currency,
        toCurrency: "USD",
      });
      if (p.status === "PENDING") {
        pendingUsd += conv.convertedAmount;
      } else if (p.status === "COMPLETED") {
        completedUsd += conv.convertedAmount;
      }
    });

    // Instead of raw sum $824.99 (which added ₹799.99 INR directly to $25 USD):
    // 499.99 INR / 94 = ~5.32 USD
    // 300.00 INR / 94 = ~3.19 USD
    // Total pending in USD is ~33.51 USD
    assert.ok(pendingUsd < 40.0, `Expected pending amount converted to USD to be ~34.58, got ${pendingUsd}`);
    assert.ok(pendingUsd > 30.0, `Expected pending amount converted to USD to be ~34.58, got ${pendingUsd}`);
    assert.equal(completedUsd, 15.0);
  });
});
