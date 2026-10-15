export interface AgentConfig {
  instructions: string;
  tools: unknown[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(value: unknown, fallback: string): string {
  if (!isObject(value)) return fallback;
  const error = value.error;
  if (typeof error === "string") return error;
  if (isObject(error) && typeof error.message === "string") return error.message;
  return fallback;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  const value: unknown = await res.json();
  if (!res.ok) throw new Error(errorMessage(value, `Failed to load ${url} (${res.status})`));
  return value;
}

export async function mintEphemeralToken(): Promise<string> {
  const res = await fetch("/api/token", { method: "POST" });
  const json: unknown = await res.json();
  const root = isObject(json) ? json : {};
  const clientSecret = isObject(root.client_secret) ? root.client_secret : undefined;
  const token: string | undefined =
    typeof root.value === "string"
      ? root.value
      : typeof clientSecret?.value === "string"
        ? clientSecret.value
        : typeof root.client_secret === "string"
          ? root.client_secret
          : undefined;
  if (!res.ok || !token) {
    throw new Error(errorMessage(json, `Token mint failed (${res.status})`));
  }
  return token;
}

export async function fetchAgentConfig(): Promise<AgentConfig> {
  const [template, knowledge, tools] = await Promise.all([
    fetchText("/agent/instructions.md"),
    fetchText("/agent/knowledge.md"),
    fetchJson("/agent/tools.json"),
  ]);
  if (!Array.isArray(tools)) throw new Error("Agent tools configuration must be an array");
  const now = new Date();
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const today =
    now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) +
    ` (${localDate})`;
  return {
    instructions: template.replace("{{TODAY}}", today) + "\n\n" + knowledge,
    tools,
  };
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    if (name === "check_court_availability") {
      const res = await fetch(`/api/availability?date=${encodeURIComponent(String(args.date ?? ""))}`);
      return await res.json();
    }
    if (name === "book_court") {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: args.full_name,
          phone: args.phone,
          court: args.court,
          datetime_iso: args.datetime_iso,
          players: args.players,
        }),
      });
      return await res.json();
    }
    return { ok: false, error: `Unknown tool: ${name}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
