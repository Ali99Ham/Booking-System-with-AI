import { GoogleGenAI } from "@google/genai";

/** Gemini Live (native-audio) model. `gemini-2.5-flash` and other text models do NOT support the Live API. */
export const DEFAULT_LIVE_MODEL = "gemini-3.8-live";
/** API version used for ephemeral tokens. Override with GEMINI_API_VERSION=v1alpha if your key/SDK requires it. */
export const DEFAULT_API_VERSION = "v1beta";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000; // messages accepted for 30 min (a Live audio session is capped at 15 min anyway)
const NEW_SESSION_WINDOW_MS = 2 * 60 * 1000; // the browser must open the WebSocket within 2 min of minting

export function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

export function liveSettings() {
  return {
    model: process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL,
    apiVersion: process.env.GEMINI_API_VERSION || DEFAULT_API_VERSION,
  };
}

function describeError(err: unknown): { status: number; message: string } {
  const e = err as { status?: number; message?: string };
  const raw = typeof e?.message === "string" ? e.message : String(err);
  const status = typeof e?.status === "number" ? e.status : undefined;
  if (status === 400 && /api key/i.test(raw)) return { status: 401, message: "Google rejected GEMINI_API_KEY (invalid key). Create one at https://aistudio.google.com/apikey" };
  if (status === 401 || status === 403) return { status: 401, message: `Google rejected the request (${status}). Check GEMINI_API_KEY and that the Gemini API is enabled for it. ${raw}` };
  if (status === 429) return { status: 429, message: "Gemini API quota / rate limit reached. Try again shortly." };
  return { status: status && status >= 400 ? status : 502, message: `Failed to create a Gemini ephemeral token: ${raw}` };
}

/**
 * Mints a short-lived, single-use token so the browser can open the Gemini Live WebSocket
 * without ever seeing the real API key.
 */
export async function mintClientSecret(): Promise<{ status: number; body: unknown }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      status: 500,
      body: { ok: false, error: "GEMINI_API_KEY is not set. Copy .env.example to .env and add your Google AI Studio key." },
    };
  }

  const { model, apiVersion } = liveSettings();
  try {
    const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion } });
    const now = Date.now();
    // No liveConnectConstraints on purpose: constraints lock the *entire* Live config server-side,
    // while this app sends its system instruction + tools from the client.
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + TOKEN_LIFETIME_MS).toISOString(),
        newSessionExpireTime: new Date(now + NEW_SESSION_WINDOW_MS).toISOString(),
      },
    });
    if (!token.name) {
      return { status: 502, body: { ok: false, error: "Gemini returned an empty ephemeral token." } };
    }
    return { status: 200, body: { ok: true, token: token.name, model, apiVersion } };
  } catch (err) {
    const { status, message } = describeError(err);
    return { status, body: { ok: false, error: message } };
  }
}
