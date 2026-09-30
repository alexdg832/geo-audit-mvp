import { DEFAULT_QUERY_TIMEOUT_MS, withRetry, withTimeout } from "./limits";
import { parseLocation } from "./location";
import { type AIProvider, type ProviderCitation, ProviderError, providerHttpError } from "./types";

const BASE_URL = "https://api.perplexity.ai";
export const PERPLEXITY_DEFAULT_MODEL = "sonar";

interface ChatOutput {
  choices?: { message?: { content?: string } }[];
  search_results?: { title?: string; url?: string; date?: string; snippet?: string }[];
  citations?: string[];
  model?: string;
  error?: { message?: string };
}

async function callChat(apiKey: string, body: Record<string, unknown>, timeoutMs: number, outer?: AbortSignal): Promise<ChatOutput> {
  return withRetry(async () => {
    const { signal, clear } = withTimeout(timeoutMs, outer);
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw providerHttpError("perplexity", res.status, text);
      return JSON.parse(text) as ChatOutput;
    } finally {
      clear();
    }
  }, { signal: outer });
}

/** Maps inline [n] markers to the sentence that precedes them so each source gets a supported passage. */
function spansForMarkers(text: string): Map<number, { start: number; end: number }[]> {
  const spans = new Map<number, { start: number; end: number }[]>();
  const marker = /\[(\d{1,2})\]/g;
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

export function createPerplexityProvider(apiKey: string): AIProvider {
  const model = process.env.PERPLEXITY_MODEL || PERPLEXITY_DEFAULT_MODEL;
  return {
    id: "perplexity",
    label: "Perplexity",
    model,
    async query(prompt, opts = {}) {
      const started = Date.now();
      const loc = parseLocation(opts.location);
      const webSearchOptions: Record<string, unknown> = { search_context_size: "medium" };
      if (loc?.country) {
        webSearchOptions.user_location = {
          country: loc.country,
          ...(loc.region ? { region: loc.region } : {}),
          ...(loc.city ? { city: loc.city } : {}),
        };
      }
      const raw = await callChat(
        apiKey,
        { model, messages: [{ role: "user", content: prompt }], web_search_options: webSearchOptions, return_related_questions: false },
        opts.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
        opts.signal
      );
      const text = raw.choices?.[0]?.message?.content ?? "";
      if (!text) throw new ProviderError("perplexity", "Perplexity returned no text output");

      const spans = spansForMarkers(text);
      const sources = raw.search_results?.length
        ? raw.search_results.map((s) => ({ url: s.url ?? null, title: s.title ?? null, snippet: s.snippet ?? null }))
        : (raw.citations ?? []).map((url) => ({ url, title: null, snippet: null }));
      const citations: ProviderCitation[] = [];
      sources.forEach((s, i) => {
        if (!s.url) return;
        const passages = spans.get(i + 1);
        if (passages?.length) {
          for (const p of passages) citations.push({ url: s.url, title: s.title, start: p.start, end: p.end, citedText: s.snippet });
        } else {
          citations.push({ url: s.url, title: s.title, start: null, end: null, citedText: s.snippet });
        }
      });
      return { engine: "perplexity", model: raw.model ?? model, answerText: text, citations, latencyMs: Date.now() - started, rawResponse: raw };
    },
    async health() {
      const { signal, clear } = withTimeout(20_000);
      try {
        const res = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: ok" }], max_tokens: 5, disable_search: true }),
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
