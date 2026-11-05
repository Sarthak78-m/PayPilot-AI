import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generatePaymentToken,
  hashPaymentToken,
  verifyPaymentToken,
  isValidPaymentTokenFormat,
  isValidTokenHashFormat,
} from "@/lib/payments";

describe("Payment Link Token Utility", () => {
  it("generates 256-bit cryptographically random Base64URL tokens", () => {
    const { token, tokenHash } = generatePaymentToken();

    assert.equal(typeof token, "string");
    assert.equal(typeof tokenHash, "string");

    // 256 bits = 32 bytes; in base64url encoding, exactly 43 characters
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);

    // Verify format validator
    assert.equal(isValidPaymentTokenFormat(token), true);
  });

  it("produces lowercase hexadecimal SHA-256 hashes (64 chars)", () => {
    const { token, tokenHash } = generatePaymentToken();

    assert.equal(tokenHash.length, 64);
    assert.match(tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(tokenHash, tokenHash.toLowerCase());

    // Verify manually recomputing hash matches
    const recomputed = hashPaymentToken(token);
    assert.equal(tokenHash, recomputed);
    assert.equal(isValidTokenHashFormat(tokenHash), true);
  });

  it("generates unique tokens with high entropy across consecutive calls", () => {
    const tokens = new Set();
    const hashes = new Set();
    const ITERATIONS = 100;

    for (let i = 0; i < ITERATIONS; i++) {
      const { token, tokenHash } = generatePaymentToken();
      tokens.add(token);
      hashes.add(tokenHash);
    }

    assert.equal(tokens.size, ITERATIONS, "All generated tokens must be unique.");
    assert.equal(hashes.size, ITERATIONS, "All generated hashes must be unique.");
  });

  it("verifies genuine public tokens against their persisted hash using constant-time comparison", () => {
    const { token, tokenHash } = generatePaymentToken();

    const isMatch = verifyPaymentToken(token, tokenHash);
    assert.equal(isMatch, true);
  });

  it("rejects tampered or corrupted tokens", () => {
    const { token, tokenHash } = generatePaymentToken();

    // Modify a single character in the token
    const lastChar = token.slice(-1);
    const replacement = lastChar === "a" ? "b" : "a";
    const tamperedToken = token.slice(0, -1) + replacement;

    assert.equal(verifyPaymentToken(tamperedToken, tokenHash), false);
  });

  it("rejects invalid or mismatched expected hashes", () => {
    const { token } = generatePaymentToken();
    const { tokenHash: otherHash } = generatePaymentToken();

    assert.equal(verifyPaymentToken(token, otherHash), false);
  });

  it("rejects UUIDs and ordinary random numbers as payment tokens", () => {
    const uuidToken = "123e4567-e89b-12d3-a456-426614174000";
    const numericToken = "1234567890123456";

    assert.equal(isValidPaymentTokenFormat(uuidToken), false);
    assert.equal(isValidPaymentTokenFormat(numericToken), false);
    assert.equal(verifyPaymentToken(uuidToken, hashPaymentToken("some-valid-token-string-12345678901234567890")), false);
  });

  it("handles null, undefined, empty, or non-string inputs safely without throwing", () => {
    assert.equal(verifyPaymentToken(null, "hash"), false);
    assert.equal(verifyPaymentToken(undefined, "hash"), false);
    assert.equal(verifyPaymentToken("", "hash"), false);
    assert.equal(verifyPaymentToken("token", null), false);
    assert.equal(verifyPaymentToken("token", undefined), false);
    assert.equal(verifyPaymentToken("token", ""), false);
    assert.equal(verifyPaymentToken({}, {}), false);
    assert.equal(isValidPaymentTokenFormat(null), false);
    assert.equal(isValidPaymentTokenFormat(""), false);
    assert.equal(isValidTokenHashFormat(null), false);
    assert.equal(isValidTokenHashFormat(""), false);
  });

  it("throws TypeError when attempting to hash an invalid or empty token", () => {
    assert.throws(() => hashPaymentToken(null), TypeError);
    assert.throws(() => hashPaymentToken(""), TypeError);
    assert.throws(() => hashPaymentToken("   "), TypeError);
    assert.throws(() => hashPaymentToken(123), TypeError);
  });
});
