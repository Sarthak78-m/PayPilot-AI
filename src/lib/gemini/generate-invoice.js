import "server-only";

import { getGeminiClient } from "./gemini-client";
import { SUPPORTED_CURRENCIES } from "@/lib/invoices/validation";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate that a date string is a genuine calendar date (YYYY-MM-DD).
 */
function isValidDate(dateStr) {
  if (typeof dateStr !== "string" || !DATE_PATTERN.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Clean potential markdown code blocks (```json ... ```) from model output.
 */
export function extractJsonFromText(rawText) {
  if (typeof rawText !== "string") {
    throw new Error("Model response is not text.");
  }

  let text = rawText.trim();

  // Strip markdown code fences if present
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  // Find the first { and last }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("No JSON object found in model output.");
  }

  const jsonSubstring = text.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonSubstring);
}

/**
 * Sanitize and enforce business rules on extracted invoice data.
 * The model's output is treated as untrusted input.
 */
export function sanitizeAndValidateDraft(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Extracted data must be an object.");
  }

  const missingFields = new Set();
  const notes = [];

  // 1. customer_name
  let customerName = null;
  if (typeof raw.customer_name === "string" && raw.customer_name.trim().length > 0) {
    const trimmed = raw.customer_name.trim();
    if (trimmed.length <= 200) {
      customerName = trimmed;
    } else {
      customerName = trimmed.slice(0, 200);
    }
  } else {
    missingFields.add("customer_name");
  }

  // 2. customer_email (optional)
  let customerEmail = null;
  if (typeof raw.customer_email === "string" && raw.customer_email.trim().length > 0) {
    const trimmedEmail = raw.customer_email.trim().toLowerCase();
    if (EMAIL_PATTERN.test(trimmedEmail)) {
      customerEmail = trimmedEmail;
    } else {
      notes.push(`Ignored invalid customer email format: "${trimmedEmail}".`);
    }
  }

  // 3. description
  let description = null;
  if (typeof raw.description === "string" && raw.description.trim().length > 0) {
    const trimmed = raw.description.trim();
    if (trimmed.length <= 1000) {
      description = trimmed;
    } else {
      description = trimmed.slice(0, 1000);
    }
  } else {
    missingFields.add("description");
  }

  // 4. amount
  let amount = null;
  const numAmount = typeof raw.amount === "number" ? raw.amount : parseFloat(raw.amount);
  if (Number.isFinite(numAmount) && numAmount > 0 && numAmount <= 9999999999.99) {
    // Round to 2 decimal places to match NUMERIC(12,2)
    amount = Math.round(numAmount * 100) / 100;
  } else {
    missingFields.add("amount");
    if (raw.amount !== undefined && raw.amount !== null) {
      notes.push("Amount must be a positive number.");
    }
  }

  // 5. currency
  let currency = null;
  if (typeof raw.currency === "string" && raw.currency.trim().length > 0) {
    const upperCurr = raw.currency.trim().toUpperCase();
    if (SUPPORTED_CURRENCIES.has(upperCurr)) {
      currency = upperCurr;
    } else {
      missingFields.add("currency");
      notes.push(
        `Currency "${upperCurr}" is unsupported. Supported: ${[...SUPPORTED_CURRENCIES].join(", ")}.`,
      );
    }
  } else {
    missingFields.add("currency");
  }

  // 6. due_date (optional)
  let dueDate = null;
  if (typeof raw.due_date === "string" && raw.due_date.trim().length > 0) {
    const trimmedDate = raw.due_date.trim();
    if (isValidDate(trimmedDate)) {
      dueDate = trimmedDate;
    } else {
      notes.push(`Ignored invalid due_date: "${trimmedDate}". Expected YYYY-MM-DD.`);
    }
  }

  // Incorporate model notes if present
  if (typeof raw.clarification_notes === "string" && raw.clarification_notes.trim().length > 0) {
    notes.push(raw.clarification_notes.trim());
  }
  if (Array.isArray(raw.missing_fields)) {
    raw.missing_fields.forEach((f) => {
      if (typeof f === "string" && ["customer_name", "description", "amount", "currency", "due_date"].includes(f)) {
        missingFields.add(f);
      }
    });
  }

  const missingFieldsArray = Array.from(missingFields);
  const isComplete =
    missingFieldsArray.length === 0 &&
    Boolean(customerName && description && amount && currency);

  return {
    draft: {
      customer_name: customerName,
      customer_email: customerEmail,
      description,
      amount,
      currency,
      due_date: dueDate,
    },
    missing_fields: missingFieldsArray,
    is_complete: isComplete,
    clarification_notes: notes.length > 0 ? notes.join(" ") : null,
  };
}

/**
 * System instruction and schema definition for Gemini.
 */
const SYSTEM_INSTRUCTION = `You are PayPilot AI's Invoice Generation Assistant.
Your task is to extract structured invoice data from a user's natural language transaction description.

STRICT ACCURACY RULES:
1. Extract only facts directly stated in the input.
2. NEVER hallucinate, guess, or invent customer details, tax rates, line items, prices, or payment terms.
3. If an amount is ambiguous (e.g. "$500 or $600 depending on hours"), set amount to null and add "amount" to missing_fields.
4. If currency is not specified or ambiguous, set currency to null and add "currency" to missing_fields. Supported currencies are: USD, EUR, GBP, CAD, AUD, INR. If another currency is used, set currency to null and note the unsupported currency in clarification_notes.
5. If customer_name is not provided, set customer_name to null and add "customer_name" to missing_fields.
6. If description of work is not provided, set description to null and add "description" to missing_fields.
7. Due date: format strictly as YYYY-MM-DD if an explicit date is provided. If relative (e.g. "due in 2 weeks"), calculate relative to today if confident, otherwise set due_date to null.
8. NEVER include user_id, invoice id, or status in the output.

Return ONLY a JSON object conforming to this schema:
{
  "customer_name": string | null,
  "customer_email": string | null,
  "description": string | null,
  "amount": number | null,
  "currency": string | null,
  "due_date": string | null,
  "missing_fields": string[],
  "clarification_notes": string | null
}`;

/**
 * Generate an invoice draft using Gemini API from a natural-language description.
 */
export async function generateInvoiceDraft(prompt, options = {}) {
  const gemini = getGeminiClient();

  const todayStr = new Date().toISOString().split("T")[0];
  const userContent = `Today's Date: ${todayStr}\n\nUser Transaction Description:\n"${prompt}"\n\nExtract the invoice fields in JSON.`;

  // Prioritize fastest, most stable models first to avoid Vercel serverless function timeouts
  const candidateModels = [
    process.env.GEMINI_MODEL,
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
  ].filter(Boolean);

  const uniqueModels = [...new Set(candidateModels)];
  const timeoutMs = options.timeoutMs || 15000;
  const perModelTimeoutMs = Math.min(timeoutMs, 8000);

  let lastError = null;

  for (const model of uniqueModels) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), perModelTimeoutMs)
      );

      const generationPromise = gemini.models.generateContent({
        model,
        contents: userContent,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      });

      const response = await Promise.race([generationPromise, timeoutPromise]);
      const responseText = response?.text;

      if (responseText) {
        const parsed = extractJsonFromText(responseText);
        return sanitizeAndValidateDraft(parsed);
      }
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("GEMINI_TIMEOUT");
}
