import { DEFAULT_QUERY_TIMEOUT_MS, withRetry, withTimeout } from "./limits";
import { parseLocation } from "./location";
import { type AIProvider, type ProviderCitation, ProviderError, providerHttpError } from "./types";

/**
 * Perplexity Agent API adapter (POST /v1/agent). Sonar chat completions support ended on
 * 2026-09-27, so the adapter targets the Agent API with an explicit model and web_search tool
 * rather than a named preset: presets are not versioned ("calling a preset by name always
 * resolves to the latest Perplexity-recommended configuration"), and a customer-facing score
 * needs a frozen configuration. The model below is what the `fast` preset resolved to when
 * this was written; override with PERPLEXITY_MODEL if Perplexity moves it.
 * Docs: https://docs.perplexity.ai/api-reference/agent-post
 */
const BASE_URL = "https://api.perplexity.ai";
export const PERPLEXITY_DEFAULT_MODEL = "openai/gpt-6-luna";
const MAX_OUTPUT_TOKENS = 2048;
const SEARCH_MAX_RESULTS = 10;

export interface AgentSearchResult {
  id?: number;
  url?: string;
  title?: string;
  snippet?: string;
  date?: string;
  last_updated?: string;
  source?: string;
}

interface AgentContentPart {
  type: string;
  text?: string;
  annotations?: { type?: string; url?: string; title?: string; start_index?: number; end_index?: number }[];
}

export interface AgentOutput {
  model?: string;
  status?: string;
  output?: { type: string; results?: AgentSearchResult[]; queries?: string[]; content?: AgentContentPart[] }[];
  error?: { message?: string } | null;
}

async function callAgent(apiKey: string, body: Record<string, unknown>, timeoutMs: number, outer?: AbortSignal): Promise<AgentOutput> {
  return withRetry(async () => {
    const { signal, clear } = withTimeout(timeoutMs, outer);
    try {
      const res = await fetch(`${BASE_URL}/v1/agent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw providerHttpError("perplexity", res.status, text);
      return JSON.parse(text) as AgentOutput;
    } finally {
      clear();
    }
  }, { signal: outer });
}

/** Maps inline [n] / [web:n] markers to the sentence that precedes them so each source gets a supported passage. */
export function spansForMarkers(text: string): Map<number, { start: number; end: number }[]> {
  const spans = new Map<number, { start: number; end: number }[]>();
  const marker = /\[(?:web:)?(\d{1,3})\]/g;
  for (const m of text.matchAll(marker)) {
    const n = Number(m[1]);
    const end = m.index + m[0].length;
    const before = text.slice(0, m.index);
    const sentenceStart = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"), before.lastIndexOf("! "), before.lastIndexOf("? "));
    const start = sentenceStart === -1 ? 0 : sentenceStart + (before[sentenceStart] === "\n" ? 1 : 2);
    const list = spans.get(n) ?? [];
    list.push({ start, end });
    spans.set(n, list);
  }
  return spans;
}

/**
 * Pulls the answer text and its sources out of an Agent API response.
 * Cited sources come from url_citation annotations when present; otherwise from [n] markers
 * resolved against the search_results ids. Only when the answer carries neither do all search
 * results count, because then "consulted" is the best evidence available.
 */
export function parseAgentOutput(raw: AgentOutput): { text: string; citations: ProviderCitation[]; searchResults: AgentSearchResult[] } {
  const searchResults: AgentSearchResult[] = [];
  const annotated: ProviderCitation[] = [];
  let text = "";
  for (const item of raw.output ?? []) {
    if (item.type === "search_results") searchResults.push(...(item.results ?? []));
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text" || typeof part.text !== "string") continue;
      const offset = text.length;
      text += part.text;
      for (const a of part.annotations ?? []) {
        if (a.type !== "url_citation" || !a.url) continue;
        annotated.push({
          url: a.url,
          title: a.title ?? null,
          start: typeof a.start_index === "number" ? offset + a.start_index : null,
          end: typeof a.end_index === "number" ? offset + a.end_index : null,
          citedText: null,
        });
      }
    }
  }
  if (annotated.length > 0) return { text, citations: annotated, searchResults };

  const byId = new Map<number, AgentSearchResult>();
  searchResults.forEach((r, i) => byId.set(typeof r.id === "number" ? r.id : i + 1, r));
  const citations: ProviderCitation[] = [];
  for (const [n, passages] of spansForMarkers(text)) {
    const r = byId.get(n);
    if (!r?.url) continue;
    for (const p of passages) citations.push({ url: r.url, title: r.title ?? null, start: p.start, end: p.end, citedText: r.snippet ?? null });
  }
  if (citations.length === 0) {
    for (const r of searchResults) if (r.url) citations.push({ url: r.url, title: r.title ?? null, start: null, end: null, citedText: r.snippet ?? null });
  }
  return { text, citations, searchResults };
}

export function createPerplexityProvider(apiKey: string): AIProvider {
  const model = process.env.PERPLEXITY_MODEL || PERPLEXITY_DEFAULT_MODEL;
  return {
    id: "perplexity",
    label: "Perplexity",
    model,
    async query(prompt, opts = {}) {
      const started = Date.now();
      const loc = parseLocation(opts.location);
      const tool: Record<string, unknown> = { type: "web_search", search_context_size: "low", max_results: SEARCH_MAX_RESULTS };
      if (loc?.country) {
        // country is required alongside any other field; city and region improve local accuracy.
        tool.user_location = {
          country: loc.country,
          ...(loc.region ? { region: loc.region } : {}),
          ...(loc.city ? { city: loc.city } : {}),
        };
      }
      const raw = await callAgent(
        apiKey,
        { model, input: prompt, max_output_tokens: MAX_OUTPUT_TOKENS, tools: [tool] },
        opts.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
        opts.signal
      );
      if (raw.error?.message) throw new ProviderError("perplexity", `Perplexity returned an error: ${raw.error.message.slice(0, 200)}`);
      const { text, citations } = parseAgentOutput(raw);
      if (!text) throw new ProviderError("perplexity", "Perplexity returned no text output");
      return { engine: "perplexity", model: raw.model ?? model, answerText: text, citations, latencyMs: Date.now() - started, rawResponse: raw };
    },
    async health() {
      const { signal, clear } = withTimeout(20_000);
      try {
        const res = await fetch(`${BASE_URL}/v1/agent`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, input: "Reply with the single word: ok", max_output_tokens: 16 }),
          signal,
          cache: "no-store",
        });
        if (res.ok) return { ok: true, message: `Key accepted; model ${model} responded` };
        const body = (await res.text()).replace(/\s+/g, " ").slice(0, 200);
        return { ok: false, message: `HTTP ${res.status}: ${body}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Health check failed" };
      } finally {
        clear();
      }
    },
  };
}
