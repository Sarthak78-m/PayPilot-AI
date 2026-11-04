import { getAuthenticatedUser } from "@/lib/auth/require-user";
import {
  generateInvoiceDraft,
  extractJsonFromText,
  sanitizeAndValidateDraft,
} from "@/lib/gemini/generate-invoice";

const MAX_PROMPT_LENGTH = 5000;

export async function POST(request) {
  try {
    // 1. Verify authentication
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        { status: "error", message: "Authentication is required." },
        { status: 401 },
      );
    }

    // 2. Parse request body
    let input;
    try {
      input = await request.json();
    } catch {
      return Response.json(
        { status: "error", message: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    // 3. Validate prompt/description field
    const rawPrompt = input?.prompt || input?.description;
    if (typeof rawPrompt !== "string" || rawPrompt.trim().length === 0) {
      return Response.json(
        {
          status: "error",
          message: "A non-empty prompt or description is required for invoice generation.",
        },
        { status: 400 },
      );
    }

    const prompt = rawPrompt.trim();
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return Response.json(
        {
          status: "error",
          message: `Prompt exceeds the maximum allowed length of ${MAX_PROMPT_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    // 4. Mock support for deterministic automated testing
    const mockError = request.headers.get("x-mock-gemini-error");
    if (mockError) {
      if (mockError === "rate-limit") {
        return Response.json(
          { status: "error", message: "AI rate limit reached. Please try again in a few moments." },
          { status: 429 },
        );
      }
      if (mockError === "timeout") {
        return Response.json(
          { status: "error", message: "AI service request timed out. Please try again." },
          { status: 504 },
        );
      }
      if (mockError === "api-error") {
        return Response.json(
          { status: "error", message: "AI generation service failed to process request." },
          { status: 502 },
        );
      }
    }

    const mockRaw = request.headers.get("x-mock-gemini-raw");
    if (mockRaw) {
      try {
        const parsed = extractJsonFromText(mockRaw);
        const validated = sanitizeAndValidateDraft(parsed);
        return Response.json({
          status: "ok",
          data: validated,
        });
      } catch {
        return Response.json(
          { status: "error", message: "Failed to process AI response. Invalid structure returned." },
          { status: 502 },
        );
      }
    }

    // 5. Verify Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        {
          status: "error",
          message: "AI invoice generation service is currently unavailable. Missing API configuration.",
        },
        { status: 503 },
      );
    }

    // 6. Call Gemini
    try {
      const draftResult = await generateInvoiceDraft(prompt);
      return Response.json({
        status: "ok",
        data: draftResult,
      });
    } catch (err) {
      if (err.message === "GEMINI_TIMEOUT") {
        return Response.json(
          { status: "error", message: "AI service request timed out. Please try again." },
          { status: 504 },
        );
      }

      const msg = err.message || "";
      if (
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.toLowerCase().includes("quota") ||
        msg.toLowerCase().includes("rate limit")
      ) {
        return Response.json(
          { status: "error", message: "AI rate limit reached. Please try again in a few moments." },
          { status: 429 },
        );
      }

      if (msg.includes("JSON") || msg.includes("No JSON object found")) {
        return Response.json(
          { status: "error", message: "Failed to process AI response. Invalid structure returned." },
          { status: 502 },
        );
      }

      return Response.json(
        { status: "error", message: "Failed to generate invoice draft." },
        { status: 500 },
      );
    }
  } catch {
    return Response.json(
      { status: "error", message: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
