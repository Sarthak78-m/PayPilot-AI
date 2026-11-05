import crypto from "node:crypto";
import "server-only";

/**
 * Byte length for 256 bits of cryptographic entropy.
 */
const TOKEN_BYTES = 32;

/**
 * Regular expression validating a 256-bit Base64URL string (43 characters).
 */
const BASE64URL_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

/**
 * Regular expression validating a 64-character lowercase SHA-256 hex string.
 */
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

/**
 * Computes a deterministic SHA-256 hash of a raw token in lowercase hexadecimal format.
 *
 * @param {string} token - Raw Base64URL public token.
 * @returns {string} 64-character lowercase hex hash.
 */
export function hashPaymentToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new TypeError("Payment token must be a non-empty string.");
  }

  return crypto
    .createHash("sha256")
    .update(token.trim(), "utf8")
    .digest("hex")
    .toLowerCase();
}

/**
 * Validates whether a token string adheres to the 256-bit Base64URL format.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isValidPaymentTokenFormat(token) {
  if (typeof token !== "string") return false;
  return BASE64URL_TOKEN_REGEX.test(token.trim());
}

/**
 * Validates whether a hash string adheres to the 64-character lowercase hex format.
 *
 * @param {string} hash
 * @returns {boolean}
 */
export function isValidTokenHashFormat(hash) {
  if (typeof hash !== "string") return false;
  return SHA256_HEX_REGEX.test(hash.trim().toLowerCase());
}

/**
 * Generates a cryptographically secure 256-bit payment link token and its corresponding SHA-256 hash.
 *
 * Entropy: 256 bits CSPRNG via crypto.randomBytes(32).
 * Public token: Base64URL encoded (43 URL-safe characters, no padding, no +, no /).
 * Hash: SHA-256 in lowercase hexadecimal (stored in database; raw token is never persisted).
 *
 * @returns {{
 *   token: string,
 *   tokenHash: string
 * }}
 */
export function generatePaymentToken() {
  const buffer = crypto.randomBytes(TOKEN_BYTES);
  const token = buffer.toString("base64url");
  const tokenHash = hashPaymentToken(token);

  return {
    token,
    tokenHash,
  };
}

/**
 * Performs a constant-time verification of a public token against a persisted SHA-256 hash.
 * Protects against timing side-channel analysis.
 *
 * @param {string} token - Public raw token provided in payment URL.
 * @param {string} expectedHash - Persisted SHA-256 hex hash from database.
 * @returns {boolean} True if the token matches the expected hash.
 */
export function verifyPaymentToken(token, expectedHash) {
  if (typeof token !== "string" || typeof expectedHash !== "string") {
    return false;
  }

  const cleanToken = token.trim();
  const cleanHash = expectedHash.trim().toLowerCase();

  if (!cleanToken || !cleanHash) {
    return false;
  }

  if (!isValidPaymentTokenFormat(cleanToken) || !isValidTokenHashFormat(cleanHash)) {
    return false;
  }

  try {
    const computedHash = hashPaymentToken(cleanToken);
    const computedBuffer = Buffer.from(computedHash, "utf8");
    const expectedBuffer = Buffer.from(cleanHash, "utf8");

    if (computedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
