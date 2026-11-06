import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizePostgrestSearchTerm } from "@/app/api/invoices/route";

describe("PostgREST Invoice Search Safety & Sanitization (Comprehensive Tests)", () => {
  it("preserves commas in legitimate business names while ensuring PostgREST safety", () => {
    const input = "Acme, Inc.";
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, "Acme, Inc.");
    // Filter expression wrapping verifies comma is inside quotes
    const expr = `customer_name.ilike."%${result}%",customer_email.ilike."%${result}%"`;
    assert.equal(expr, 'customer_name.ilike."%Acme, Inc.%",customer_email.ilike."%Acme, Inc.%"');
  });

  it("preserves parentheses in client company names", () => {
    const input = "Google (Alphabet)";
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, "Google (Alphabet)");
    const expr = `customer_name.ilike."%${result}%",customer_email.ilike."%${result}%"`;
    assert.match(expr, /Google \(Alphabet\)/);
  });

  it("preserves periods in customer email addresses and domain names", () => {
    const input = "jane.doe@example.co.uk";
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, "jane.doe@example.co.uk");
  });

  it("preserves colons in project identifiers", () => {
    const input = "Invoice: 2026-X";
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, "Invoice: 2026-X");
  });

  it("escapes double quotes to prevent string literal breakout in PostgREST", () => {
    const input = 'John "The Boss" Smith';
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, 'John \\"The Boss\\" Smith');
    const expr = `customer_name.ilike."%${result}%",customer_email.ilike."%${result}%"`;
    assert.equal(expr, 'customer_name.ilike."%John \\"The Boss\\" Smith%",customer_email.ilike."%John \\"The Boss\\" Smith%"');
  });

  it("escapes backslashes to prevent escape hijacking", () => {
    const input = "corporate\\finance";
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, "corporate\\\\finance");
  });

  it("handles asterisks safely without corrupting pattern matching", () => {
    const input = "*VIP* Client";
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, "*VIP* Client");
  });

  it("escapes percent signs to ensure literal wildcard matching", () => {
    const input = "50% deposit";
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, "50\\% deposit");
  });

  it("escapes underscores to prevent single-character wildcard expansion", () => {
    const input = "john_doe@example.com";
    const result = sanitizePostgrestSearchTerm(input);
    assert.equal(result, "john\\_doe@example.com");
  });

  it("preserves full international Unicode characters (German, French, Japanese, Emoji)", () => {
    const unicodeInputs = [
      "Müller & Söhne",
      "Éléonore Café",
      "山田 太郎",
      "🚀 Stark Enterprises",
    ];

    unicodeInputs.forEach((input) => {
      const result = sanitizePostgrestSearchTerm(input);
      assert.ok(result.includes(input), `Unicode preservation failed for: ${input}`);
    });
  });

  it("returns empty string for empty, whitespace, or invalid non-string inputs", () => {
    assert.equal(sanitizePostgrestSearchTerm(""), "");
    assert.equal(sanitizePostgrestSearchTerm("     "), "");
    assert.equal(sanitizePostgrestSearchTerm(null), "");
    assert.equal(sanitizePostgrestSearchTerm(undefined), "");
    assert.equal(sanitizePostgrestSearchTerm(12345), "");
    assert.equal(sanitizePostgrestSearchTerm({}), "");
  });

  it("caps very long search strings to 100 characters to prevent buffer exhaustion", () => {
    const longInput = "A".repeat(500);
    const result = sanitizePostgrestSearchTerm(longInput);
    assert.equal(result.length, 100);
    assert.equal(result, "A".repeat(100));
  });

  it("neutralizes injection attempts that attempt to add unauthorized filter conditions", () => {
    const injectionAttempt = 'test"),user_id.neq.other_id,("malicious';
    const result = sanitizePostgrestSearchTerm(injectionAttempt);
    // Double quotes must be escaped so parser cannot escape literal
    assert.ok(result.includes('\\"'));
    const expr = `customer_name.ilike."%${result}%",customer_email.ilike."%${result}%"`;
    // Verify whole string is safely contained within PostgREST quoted literal
    assert.ok(expr.includes('\\")'));
  });
});
