import { DEFAULT_COMPLETION_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS, withRetry, withTimeout } from "./limits";
import { parseLocation } from "./location";
import { type AIProvider, type ProviderCitation, ProviderError, providerHttpError } from "./types";

const BASE_URL = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";
export const ANTHROPIC_FAST_MODEL = "claude-haiku-4-5-20251001";
export const ANTHROPIC_WEB_SEARCH_TOOL = "web_search_20250305";

interface TextBlock {
  type: string;
  text?: string;
  citations?: { type: string; url?: string; title?: string; cited_text?: string }[];
}

interface MessagesOutput {
  content?: TextBlock[];
  model?: string;
  stop_reason?: string;
  error?: { message?: string };
}

async function callMessages(apiKey: string, body: Record<string, unknown>, timeoutMs: number, outer?: AbortSignal): Promise<MessagesOutput> {
  return withRetry(async () => {
    const { signal, clear } = withTimeout(timeoutMs, outer);
    try {
      const res = await fetch(`${BASE_URL}/messages`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw providerHttpError("anthropic", res.status, text);
      return JSON.parse(text) as MessagesOutput;
    } finally {
      clear();
    }
  }, { signal: outer });
}

function extractText(output: MessagesOutput): { text: string; citations: ProviderCitation[] } {
  let text = "";
  const citations: ProviderCitation[] = [];
  for (const block of output.content ?? []) {
    if (block.type !== "text" || typeof block.text !== "string") continue;
    const start = text.length;
    text += block.text;
    for (const c of block.citations ?? []) {
      if (c.type !== "web_search_result_location" || !c.url) continue;
      citations.push({ url: c.url, title: c.title ?? null, start, end: text.length, citedText: c.cited_text ?? null });
    }
  }
  return { text, citations };
}

export function createAnthropicProvider(apiKey: string): AIProvider {
  const model = process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL;
  const fastModel = process.env.ANTHROPIC_FAST_MODEL || ANTHROPIC_FAST_MODEL;
  const toolType = process.env.ANTHROPIC_WEB_SEARCH_TOOL || ANTHROPIC_WEB_SEARCH_TOOL;
  return {
    id: "anthropic",
    label: "Claude",
    model,
    async query(prompt, opts = {}) {
      const started = Date.now();
      const loc = parseLocation(opts.location);
      const tool: Record<string, unknown> = { type: toolType, name: "web_search", max_uses: 5 };
      if (loc) {
        tool.user_location = {
          type: "approximate",
          ...(loc.city ? { city: loc.city } : {}),
          ...(loc.region ? { region: loc.region } : {}),
          ...(loc.country ? { country: loc.country } : {}),
        };
      }
      const raw = await callMessages(
        apiKey,
        { model, max_tokens: 1500, messages: [{ role: "user", content: prompt }], tools: [tool] },
        opts.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
        opts.signal
      );
      const { text, citations } = extractText(raw);
      if (!text) throw new ProviderError("anthropic", "Claude returned no text output");
      return { engine: "anthropic", model: raw.model ?? model, answerText: text, citations, latencyMs: Date.now() - started, rawResponse: raw };
    },
    async complete(system, user, opts = {}) {
      const started = Date.now();
      const raw = await callMessages(
        apiKey,
        { model: fastModel, max_tokens: 1200, system, messages: [{ role: "user", content: user }] },
        opts.timeoutMs ?? DEFAULT_COMPLETION_TIMEOUT_MS,
        opts.signal
      );
      const { text } = extractText(raw);
      return { engine: "anthropic", model: raw.model ?? fastModel, text, latencyMs: Date.now() - started };
    },
    async health() {
      const { signal, clear } = withTimeout(10_000);
      try {
        const res = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}`, {
          headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION },
          signal,
          cache: "no-store",
        });
        if (res.ok) return { ok: true, message: `Key accepted; model ${model} available` };
        return { ok: false, message: `HTTP ${res.status} from /models/${model}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Health check failed" };
      } finally {
        clear();
      }
    },
  };
}
