const XAI_BASE = "https://api.x.ai/v1";

export async function mintClientSecret(): Promise<{ status: number; body: unknown }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      status: 500,
      body: { ok: false, error: "XAI_API_KEY is not set. Copy .env.example to .env and add your key." },
    };
  }

  try {
    const res = await fetch(`${XAI_BASE}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
    const body = await res.json().catch(() => ({ ok: false, error: `Non-JSON response (${res.status})` }));
    return { status: res.status, body };
  } catch (err) {
    return { status: 502, body: { ok: false, error: `Failed to reach api.x.ai: ${String(err)}` } };
  }
}
