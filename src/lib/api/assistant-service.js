/**
 * PayPilot AI — AI Assistant Service
 *
 * Client-side integration layer for the conversational AI Assistant.
 * Connects directly to the backend endpoint POST /api/assistant/chat.
 *
 * BACKEND API CONTRACT SPECIFICATION:
 * -----------------------------------------------------------------------------
 * Endpoint: POST /api/assistant/chat
 * Headers:
 *   - Content-Type: application/json
 *   - Cookie: session auth token (managed via credentials: "include")
 *
 * Request Payload (JSON):
 * {
 *   "message": "Which client invoices are overdue?", // string, required
 *   "history": [                                     // array, optional
 *     { "role": "user", "content": "..." },
 *     { "role": "assistant", "content": "..." }
 *   ],
 *   "context": {                                     // object, optional client metadata
 *     "clientTimestamp": "2026-11-05T12:00:00Z",
 *     "activeCurrency": "USD"
 *   }
 * }
 *
 * Successful Response (200 OK):
 * {
 *   "status": "ok",
 *   "data": {
 *     "reply": "You currently have 2 invoices overdue totaling $2,200.00...",
 *     "suggestedActions": [
 *       { "label": "Send Reminders", "action": "navigate", "target": "/invoices?status=overdue" }
 *     ]
 *   }
 * }
 *
 * Error Response (4xx / 5xx):
 * {
 *   "status": "error",
 *   "message": "Descriptive error message"
 * }
 * -----------------------------------------------------------------------------
 */

export async function sendAssistantMessage({ message, history = [] }) {
  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      data: null,
      error: "Message content cannot be empty.",
      status: 400,
      isUnavailable: false,
    };
  }

  try {
    const res = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        message: message.trim(),
        history,
      }),
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          data: null,
          error:
            "The conversational AI Assistant endpoint (/api/assistant/chat) is not yet deployed on the backend. Server-side integration is scheduled for backend rollout.",
          status: 404,
          isUnavailable: true,
        };
      }

      if (res.status === 401) {
        return {
          data: null,
          error: "Your session has expired. Please sign in to consult the AI Assistant.",
          status: 401,
          is401: true,
        };
      }

      const errorBody = await res.json().catch(() => ({}));
      return {
        data: null,
        error: errorBody.message || `AI Assistant request failed with status ${res.status}.`,
        status: res.status,
        isUnavailable: false,
      };
    }

    const json = await res.json();
    return {
      data: json.data || json,
      error: null,
      status: 200,
      isUnavailable: false,
    };
  } catch {
    return {
      data: null,
      error:
        "Unable to connect to the AI Assistant service. Please verify your network connection and server status.",
      status: 0,
      isUnavailable: true,
    };
  }
}
