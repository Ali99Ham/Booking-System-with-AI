import { Behavior, type FunctionDeclaration, type Schema, type Tool } from "@google/genai";

export interface AgentConfig {
  instructions: string;
  tools: Tool[];
}

export interface LiveToken {
  token: string;
  model: string;
  apiVersion: string;
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

export async function mintEphemeralToken(): Promise<LiveToken> {
  const res = await fetch("/api/token", { method: "POST" });
  const json: unknown = await res.json().catch(() => ({}));
  const root = isObject(json) ? json : {};
  if (!res.ok || typeof root.token !== "string" || !root.token) {
    throw new Error(errorMessage(json, `Token mint failed (${res.status})`));
  }
  return {
    token: root.token,
    model: typeof root.model === "string" ? root.model : "gemini-3.8-live",
    apiVersion: typeof root.apiVersion === "string" ? root.apiVersion : "v1beta",
  };
}

/** agent/tools.json uses JSON-Schema style (lowercase types); Gemini's Schema expects UPPERCASE type enums. */
function toGeminiSchema(node: unknown): Schema {
  if (Array.isArray(node)) return node.map(toGeminiSchema) as unknown as Schema;
  if (!isObject(node)) return node as Schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" && typeof value === "string") out[key] = value.toUpperCase();
    else if (key === "properties" && isObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toGeminiSchema(v)]));
    } else if (key === "items") out[key] = toGeminiSchema(value);
    else out[key] = value;
  }
  return out as Schema;
}

export function toGeminiTools(rawTools: unknown[]): Tool[] {
  const functionDeclarations: FunctionDeclaration[] = rawTools.map((raw) => {
    if (!isObject(raw) || typeof raw.name !== "string") throw new Error("Each tool in tools.json needs a name");
    return {
      name: raw.name,
      description: typeof raw.description === "string" ? raw.description : undefined,
      parameters: raw.parameters ? toGeminiSchema(raw.parameters) : undefined,
      // Gemini 3.8 Live defaults to NON_BLOCKING. The booking flow needs the real tool result
      // before the model speaks, so we force the classic blocking behaviour.
      behavior: Behavior.BLOCKING,
    };
  });
  return [{ functionDeclarations }];
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
    tools: toGeminiTools(tools),
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
