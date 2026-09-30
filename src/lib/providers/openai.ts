import { DEFAULT_COMPLETION_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS, withRetry, withTimeout } from "./limits";
import { parseLocation } from "./location";
import { type AIProvider, type ProviderCitation, ProviderError, providerHttpError } from "./types";

const BASE_URL = "https://api.openai.com/v1";
export const OPENAI_DEFAULT_MODEL = "gpt-5";
export const OPENAI_FAST_MODEL = "gpt-5-mini";

interface OutputTextPart {
  type: string;
  text?: string;
  annotations?: { type: string; url?: string; title?: string; start_index?: number; end_index?: number }[];
}

interface ResponsesOutput {
  output?: { type: string; content?: OutputTextPart[] }[];
  error?: { message?: string };
}

async function callResponses(apiKey: string, body: Record<string, unknown>, timeoutMs: number, outer?: AbortSignal): Promise<ResponsesOutput> {
  return withRetry(async () => {
    const { signal, clear } = withTimeout(timeoutMs, outer);
    try {
      const res = await fetch(`${BASE_URL}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw providerHttpError("openai", res.status, text);
      return JSON.parse(text) as ResponsesOutput;
    } finally {
      clear();
    }
  }, { signal: outer });
}

function extractText(output: ResponsesOutput): { text: string; citations: ProviderCitation[] } {
  let text = "";
  const citations: ProviderCitation[] = [];
  for (const item of output.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text" || typeof part.text !== "string") continue;
      const offset = text.length;
      text += part.text;
      for (const a of part.annotations ?? []) {
        if (a.type !== "url_citation" || !a.url) continue;
        citations.push({
          url: a.url,
          title: a.title ?? null,
          start: typeof a.start_index === "number" ? offset + a.start_index : null,
          end: typeof a.end_index === "number" ? offset + a.end_index : null,
          citedText: null,
        });
      }
    }
  }
  return { text, citations };
}

export function createOpenAIProvider(apiKey: string): AIProvider {
  const model = process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
  const fastModel = process.env.OPENAI_FAST_MODEL || OPENAI_FAST_MODEL;
  return {
    id: "openai",
    label: "ChatGPT",
    model,
    async query(prompt, opts = {}) {
      const started = Date.now();
      const loc = parseLocation(opts.location);
      const tool: Record<string, unknown> = { type: "web_search" };
      if (loc) {
        tool.user_location = {
          type: "approximate",
          ...(loc.country ? { country: loc.country } : {}),
          ...(loc.city ? { city: loc.city } : {}),
          ...(loc.region ? { region: loc.region } : {}),
        };
      }
      const raw = await callResponses(
        apiKey,
        { model, input: prompt, tools: [tool], tool_choice: "auto" },
        opts.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
        opts.signal
      );
      const { text, citations } = extractText(raw);
      if (!text) throw new ProviderError("openai", "OpenAI returned no text output");
      return { engine: "openai", model, answerText: text, citations, latencyMs: Date.now() - started, rawResponse: raw };
    },
    async complete(system, user, opts = {}) {
      const started = Date.now();
      const raw = await callResponses(
        apiKey,
        { model: fastModel, instructions: system, input: user },
        opts.timeoutMs ?? DEFAULT_COMPLETION_TIMEOUT_MS,
        opts.signal
      );
      const { text } = extractText(raw);
      return { engine: "openai", model: fastModel, text, latencyMs: Date.now() - started };
    },
    async health() {
      const { signal, clear } = withTimeout(10_000);
      try {
        const res = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
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
