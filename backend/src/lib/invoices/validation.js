/**
 * Invoice validation utilities.
 *
 * Follows the same pattern as @/lib/auth/validation.js:
 *   - Pure functions, no side effects.
 *   - Return { valid: true, data } or { valid: false, errors }.
 *   - Trim and normalise inputs before validation.
 *   - Keep validation separate from database operations.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Supported currencies (ISO 4217).
 * Extend this set as the product adds more currency support.
 */
const SUPPORTED_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "CAD", "AUD", "INR",
]);

/**
 * Valid invoice statuses.
 * Must match the database CHECK constraint on invoices.status.
 */
const VALID_STATUSES = new Set([
  "DRAFT", "PENDING", "PAID", "OVERDUE", "CANCELLED",
]);

/**
 * Allowed status transitions.
 *
 * Key   = current status.
 * Value = set of statuses the invoice may transition to.
 *
 * Rules:
 *   - DRAFT     -> PENDING, CANCELLED
 *   - PENDING   -> PAID, OVERDUE, CANCELLED
 *   - OVERDUE   -> PAID, CANCELLED
 *   - PAID      -> (no transitions allowed via ordinary update)
 *   - CANCELLED -> (no transitions allowed)
 */
const STATUS_TRANSITIONS = {
  DRAFT:     new Set(["PENDING", "CANCELLED"]),
  PENDING:   new Set(["PAID", "OVERDUE", "CANCELLED"]),
  OVERDUE:   new Set(["PAID", "CANCELLED"]),
  PAID:      new Set(),
  CANCELLED: new Set(),
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parse and validate an amount value.
 *
 * Accepts a number or a numeric string.
 * Returns the amount as a finite number, or NaN if invalid.
 *
 * Financial precision note:
 *   JavaScript Number is IEEE 754 double — safe for values up to
 *   ~9 quadrillion cents.  The database column (numeric(12,2))
 *   is the authoritative precision boundary.  This validator only
 *   checks that the value is positive, finite, and has at most
 *   two decimal places.
 */
function parseAmount(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return NaN;
    return Number(trimmed);
  }
  return NaN;
}

/**
 * Validate that a date string is a valid ISO 8601 date (YYYY-MM-DD).
 * Returns the normalised date string or null.
 */
function parseDate(value) {
  const str = asTrimmedString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;

  const d = new Date(str + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;

  // Verify that the parsed date matches the input (rejects e.g. Feb 30).
  const [y, m, day] = str.split("-").map(Number);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() + 1 !== m || d.getUTCDate() !== day) {
    return null;
  }

  return str;
}

// ──────────────────────────────────────────────
// Exported constants (read-only)
// ──────────────────────────────────────────────

export { SUPPORTED_CURRENCIES, VALID_STATUSES, STATUS_TRANSITIONS };

// ──────────────────────────────────────────────
// Invoice creation validation
// ──────────────────────────────────────────────

/**
 * Validate input for creating a new invoice.
 *
 * Required fields:
 *   customer_name  — non-empty string, 1-200 chars
 *   description    — non-empty string, 1-1000 chars
 *   amount         — positive finite number, max 2 decimal places
 *   currency       — one of SUPPORTED_CURRENCIES
 *
 * Optional fields (database allows NULL):
 *   customer_email — valid email format if provided
 *   due_date       — valid YYYY-MM-DD if provided
 *
 * The server assigns: user_id, status (default "draft"), created_at, updated_at.
 */
export function validateCreateInvoiceInput(input) {
  const errors = {};

  // customer_name (required)
  const customerName = asTrimmedString(input?.customer_name);
  if (customerName.length < 1 || customerName.length > 200) {
    errors.customer_name = "Customer name must be between 1 and 200 characters.";
  }

  // customer_email (optional — database allows NULL)
  const rawEmail = asTrimmedString(input?.customer_email);
  let customerEmail = null;
  if (rawEmail.length > 0) {
    customerEmail = rawEmail.toLowerCase();
    if (!EMAIL_PATTERN.test(customerEmail)) {
      errors.customer_email = "Enter a valid customer email address.";
    }
  }

  // description (required)
  const description = asTrimmedString(input?.description);
  if (description.length < 1 || description.length > 1000) {
    errors.description = "Description must be between 1 and 1000 characters.";
  }

  // amount (required)
  const amount = parseAmount(input?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = "Amount must be a positive number.";
  } else if (Math.round(amount * 100) !== amount * 100) {
    errors.amount = "Amount must have at most two decimal places.";
  } else if (amount > 9999999999.99) {
    errors.amount = "Amount exceeds the maximum allowed value.";
  }

  // currency (required)
  const currency = asTrimmedString(input?.currency).toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    errors.currency = `Currency must be one of: ${[...SUPPORTED_CURRENCIES].join(", ")}.`;
  }

  // due_date (optional — database allows NULL)
  let dueDate = null;
  if (input?.due_date !== undefined && input.due_date !== null && asTrimmedString(input.due_date).length > 0) {
    dueDate = parseDate(input.due_date);
    if (!dueDate) {
      errors.due_date = "Due date must be a valid date in YYYY-MM-DD format.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      customer_name: customerName,
      customer_email: customerEmail,
      description,
      amount,
      currency,
      due_date: dueDate,
    },
  };
}

// ──────────────────────────────────────────────
// Invoice update validation
// ──────────────────────────────────────────────

/**
 * Validate input for updating an existing invoice.
 *
 * All fields are optional — only provided fields are validated.
 * Returns the validated subset of fields to apply.
 *
 * user_id, id, created_at cannot be changed by the client.
 * status changes are validated separately via validateStatusTransition.
 */
export function validateUpdateInvoiceInput(input) {
  const errors = {};
  const data = {};

  if (input?.customer_name !== undefined) {
    const customerName = asTrimmedString(input.customer_name);
    if (customerName.length < 1 || customerName.length > 200) {
      errors.customer_name = "Customer name must be between 1 and 200 characters.";
    } else {
      data.customer_name = customerName;
    }
  }

  if (input?.customer_email !== undefined) {
    const customerEmail = asTrimmedString(input.customer_email).toLowerCase();
    if (!EMAIL_PATTERN.test(customerEmail)) {
      errors.customer_email = "Enter a valid customer email address.";
    } else {
      data.customer_email = customerEmail;
    }
  }

  if (input?.description !== undefined) {
    const description = asTrimmedString(input.description);
    if (description.length < 1 || description.length > 1000) {
      errors.description = "Description must be between 1 and 1000 characters.";
    } else {
      data.description = description;
    }
  }

  if (input?.amount !== undefined) {
    const amount = parseAmount(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.amount = "Amount must be a positive number.";
    } else if (Math.round(amount * 100) !== amount * 100) {
      errors.amount = "Amount must have at most two decimal places.";
    } else if (amount > 9999999999.99) {
      errors.amount = "Amount exceeds the maximum allowed value.";
    } else {
      data.amount = amount;
    }
  }

  if (input?.currency !== undefined) {
    const currency = asTrimmedString(input.currency).toUpperCase();
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      errors.currency = `Currency must be one of: ${[...SUPPORTED_CURRENCIES].join(", ")}.`;
    } else {
      data.currency = currency;
    }
  }

  if (input?.due_date !== undefined) {
    const dueDate = parseDate(input.due_date);
    if (!dueDate) {
      errors.due_date = "Due date must be a valid date in YYYY-MM-DD format.";
    } else {
      data.due_date = dueDate;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  if (Object.keys(data).length === 0) {
    return { valid: false, errors: { _form: "No valid fields provided for update." } };
  }

  return { valid: true, data };
}

// ──────────────────────────────────────────────
// Status transition validation
// ──────────────────────────────────────────────

/**
 * Validate whether a status transition is permitted.
 *
 * @param {string} currentStatus  — the invoice's current status.
 * @param {string} newStatus      — the requested new status.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateStatusTransition(currentStatus, newStatus) {
  const normCurrent = asTrimmedString(currentStatus).toUpperCase();
  const normNew = asTrimmedString(newStatus).toUpperCase();

  if (!VALID_STATUSES.has(normNew)) {
    return { valid: false, error: `Invalid status: ${newStatus}.` };
  }

  if (normCurrent === normNew) {
    return { valid: true };
  }

  const allowed = STATUS_TRANSITIONS[normCurrent];
  if (!allowed || !allowed.has(normNew)) {
    return {
      valid: false,
      error: `Cannot change invoice status from "${currentStatus}" to "${newStatus}".`,
    };
  }

  return { valid: true };
}

// ──────────────────────────────────────────────
// UUID validation
// ──────────────────────────────────────────────

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a value is a valid UUID v4 string.
 */
export function isValidUUID(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
