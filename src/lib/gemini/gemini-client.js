import "server-only";

import dns from "node:dns";
import { GoogleGenAI } from "@google/genai";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore if unsupported
}

let geminiClient;

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }

  return geminiClient;
}
