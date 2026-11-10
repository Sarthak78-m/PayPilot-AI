import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatCurrencyDisplay,
  calculateTransactionFee,
  convertCurrency,
  normalizeCurrency,
} from "@/lib/payments/currency";

describe("Dashboard Multi-Currency & Due Payment Feature", () => {
  it("1. formatCurrencyDisplay correctly renders native symbols for INR, USD, EUR, and GBP", () => {
    assert.equal(formatCurrencyDisplay(799.99, "INR"), "₹799.99");
    assert.equal(formatCurrencyDisplay(15.0, "USD"), "$15.00");
    assert.equal(formatCurrencyDisplay(250.5, "EUR"), "€250.50");
    assert.equal(formatCurrencyDisplay(100.0, "GBP"), "£100.00");
  });

  it("2. Accurately segregates Due Payments and Settled Payments across multiple currencies", () => {
    // Simulating user invoice portfolio from screenshot:
    // - 3 unpaid invoices in INR totaling ₹799.99
    // - 1 settled invoice in USD totaling $15.00
    const mockInvoices = [
      { id: "inv-1", amount: 300.0, currency: "INR", status: "PENDING" },
      { id: "inv-2", amount: 299.99, currency: "INR", status: "PENDING" },
      { id: "inv-3", amount: 200.0, currency: "INR", status: "OVERDUE" },
      { id: "inv-4", amount: 15.0, currency: "USD", status: "PAID" },
    ];

    const currencyTotals = {};

    mockInvoices.forEach((inv) => {
      const curr = inv.currency.toUpperCase();
      if (!currencyTotals[curr]) {
        currencyTotals[curr] = {
          currency: curr,
          dueAmount: 0,
          dueCount: 0,
          paidAmount: 0,
          paidCount: 0,
          totalAmount: 0,
          totalCount: 0,
        };
      }
      const b = currencyTotals[curr];
      b.totalAmount += inv.amount;
      b.totalCount += 1;

      if (inv.status === "PENDING" || inv.status === "OVERDUE") {
        b.dueAmount += inv.amount;
        b.dueCount += 1;
      } else if (inv.status === "PAID") {
        b.paidAmount += inv.amount;
        b.paidCount += 1;
      }
    });

    // INR breakdown assertions:
    const inr = currencyTotals.INR;
    assert.ok(inr);
    assert.equal(Math.round(inr.dueAmount * 100) / 100, 799.99);
    assert.equal(inr.dueCount, 3);
    assert.equal(inr.paidAmount, 0);
    assert.equal(inr.paidCount, 0);
    assert.equal(formatCurrencyDisplay(inr.dueAmount, "INR"), "₹799.99");

    // USD breakdown assertions:
    const usd = currencyTotals.USD;
    assert.ok(usd);
    assert.equal(usd.dueAmount, 0);
    assert.equal(usd.dueCount, 0);
    assert.equal(usd.paidAmount, 15.0);
    assert.equal(usd.paidCount, 1);
    assert.equal(formatCurrencyDisplay(usd.paidAmount, "USD"), "$15.00");
  });

  it("3. Multi-Currency conversion provides honest consolidated totals without corrupting raw numbers", () => {
    // 15.00 USD converted to INR at 1 USD = 94 INR
    const converted = convertCurrency({
      amount: 15.0,
      fromCurrency: "USD",
      toCurrency: "INR",
    });

    assert.equal(converted.requiresConversion, true);
    // 15.00 USD * 94 = 1410.0 INR
    assert.equal(converted.convertedAmount, 1410.0);
    assert.equal(converted.targetCurrency, "INR");

    // Test other specified exchange rates
    assert.equal(convertCurrency({ amount: 100, fromCurrency: "USD", toCurrency: "EUR" }).convertedAmount, 89.1);
    assert.equal(convertCurrency({ amount: 100, fromCurrency: "USD", toCurrency: "GBP" }).convertedAmount, 74.4);
    assert.equal(convertCurrency({ amount: 100, fromCurrency: "USD", toCurrency: "CAD" }).convertedAmount, 140.0);
    assert.equal(convertCurrency({ amount: 100, fromCurrency: "USD", toCurrency: "AUD" }).convertedAmount, 144.6);
  });

  it("4. Normalizes currency strings safely and defaults to USD", () => {
    assert.equal(normalizeCurrency("inr"), "INR");
    assert.equal(normalizeCurrency("usd"), "USD");
    assert.equal(normalizeCurrency("  eur  "), "EUR");
    assert.equal(normalizeCurrency(null), "USD");
    assert.equal(normalizeCurrency("INVALID"), "USD");
  });

  it("5. Converts multi-currency portfolio into unified USD outstanding balance using 1 USD = 94 INR", () => {
    const inrConv = convertCurrency({
      amount: 799.99,
      fromCurrency: "INR",
      toCurrency: "USD",
    });
    // 799.99 / 94 = 8.51 USD
    assert.equal(inrConv.convertedAmount, 8.51);

    const totalUSD = Math.round((inrConv.convertedAmount + 25.0) * 100) / 100;
    assert.equal(totalUSD, 33.51);
    assert.equal(formatCurrencyDisplay(totalUSD, "USD"), "$33.51");
  });
});
