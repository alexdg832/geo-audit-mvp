import { DEFAULT_COMPLETION_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS, withRetry, withTimeout } from "./limits";
import { parseLocation } from "./location";
import { type AIProvider, type ProviderCitation, ProviderError, providerHttpError } from "./types";

/**
 * Anthropic Messages API with the server-side web search tool.
 * web_search_20250305 is still a current tool version ("basic web search") and calls search
 * directly, which keeps the simple response shape; the 2026 versions default to dynamic
 * filtering through code execution unless allowed_callers is set.
 * Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 */
const BASE_URL = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";
export const ANTHROPIC_FAST_MODEL = "claude-haiku-4-5-20251001";
export const ANTHROPIC_WEB_SEARCH_TOOL = "web_search_20250305";

interface ContentBlock {
  type: string;
  text?: string;
  citations?: { type: string; url?: string; title?: string | null; cited_text?: string }[];
  /** web_search_tool_result: a list of results, or a single error object. */
  content?: unknown;
}

export interface MessagesOutput {
  content?: ContentBlock[];
  model?: string;
  stop_reason?: string;
  error?: { message?: string };
}

/** Error codes for which a retry can reasonably succeed; the rest are request or quota problems. */
const RETRYABLE_SEARCH_ERRORS = new Set(["too_many_requests", "unavailable"]);

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

export function extractText(output: MessagesOutput): { text: string; citations: ProviderCitation[] } {
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

/** The API answers 200 even when a search fails; the failure sits inside the tool result block. */
export function searchErrorCodes(output: MessagesOutput): string[] {
  const codes: string[] = [];
  for (const block of output.content ?? []) {
    if (block.type !== "web_search_tool_result") continue;
    const content = block.content as { type?: string; error_code?: string } | unknown[] | undefined;
    if (content && !Array.isArray(content) && content.type === "web_search_tool_result_error") codes.push(content.error_code ?? "unknown");
  }
  return codes;
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
      // No temperature: current models reject any value other than 1.0, and 1.0 is the default.
      const raw = await callMessages(
        apiKey,
        { model, max_tokens: 1500, messages: [{ role: "user", content: prompt }], tools: [tool] },
        opts.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
        opts.signal
      );
      if (raw.stop_reason === "pause_turn") {
        throw new ProviderError("anthropic", "Claude paused a long-running search turn", { retryable: true });
      }
      const { text, citations } = extractText(raw);
      const errors = searchErrorCodes(raw);
      if (errors.length > 0 && citations.length === 0) {
        // Without this the run would be recorded as a clean "business not mentioned" answer.
        throw new ProviderError("anthropic", `Claude web search failed: ${errors.join(", ")}`, { retryable: errors.every((c) => RETRYABLE_SEARCH_ERRORS.has(c)) });
      }
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
