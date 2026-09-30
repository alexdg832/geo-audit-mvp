import { DEFAULT_COMPLETION_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS, withRetry, withTimeout } from "./limits";
import { type AIProvider, type ProviderCitation, ProviderError, providerHttpError } from "./types";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
// The Gemini API retired gemini-2.5-flash for new users in 2026 and points at gemini-3.8-flash.
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
export const GEMINI_FAST_MODEL = "gemini-3.8-flash";

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

interface GroundingSupport {
  /** startIndex/endIndex are UTF-8 byte offsets inside the Part at partIndex, not inside the joined answer. */
  segment?: { partIndex?: number; startIndex?: number; endIndex?: number; text?: string };
  groundingChunkIndices?: number[];
}

interface GenerateContentOutput {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: GroundingChunk[]; groundingSupports?: GroundingSupport[]; webSearchQueries?: string[] };
  }[];
  error?: { message?: string };
}

async function callGenerate(apiKey: string, model: string, body: Record<string, unknown>, timeoutMs: number, outer?: AbortSignal): Promise<GenerateContentOutput> {
  return withRetry(async () => {
    const { signal, clear } = withTimeout(timeoutMs, outer);
    try {
      const res = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) throw providerHttpError("gemini", res.status, text);
      return JSON.parse(text) as GenerateContentOutput;
    } finally {
      clear();
    }
  }, { signal: outer });
}

/** Gemini reports segment offsets in UTF-8 bytes; convert them to JS string indices. */
function byteToCharIndex(text: string, byteIndex: number): number {
  const bytes = Buffer.from(text, "utf8");
  if (byteIndex >= bytes.length) return text.length;
  return bytes.subarray(0, byteIndex).toString("utf8").length;
}

/**
 * Maps a grounding segment onto the joined answer text. The offsets are relative to the Part named by
 * partIndex, so they are converted against that part's text and shifted by the characters before it.
 * The span is dropped when it cannot be anchored or when the slice it names is not segment.text,
 * since a mis-anchored span would be persisted and shown as the "supported passage" downstream.
 */
function segmentSpan(segment: GroundingSupport["segment"], partTexts: string[]): { start: number | null; end: number | null } {
  const none = { start: null, end: null };
  if (!segment || typeof segment.endIndex !== "number") return none;
  // The REST API omits proto3 default values, so a missing partIndex or startIndex means 0.
  const partIndex = segment.partIndex ?? 0;
  const partText = partTexts[partIndex];
  if (partText === undefined) return none;
  const localStart = byteToCharIndex(partText, segment.startIndex ?? 0);
  const localEnd = byteToCharIndex(partText, segment.endIndex);
  if (typeof segment.text === "string" && partText.slice(localStart, localEnd) !== segment.text) return none;
  const offset = partTexts.slice(0, partIndex).reduce((sum, t) => sum + t.length, 0);
  return { start: offset + localStart, end: offset + localEnd };
}

/** The grounding redirect URLs hide the real source; follow one hop to recover it, keeping the redirect on failure. */
async function resolveRedirect(uri: string, signal?: AbortSignal): Promise<string> {
  if (!/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(uri)) return uri;
  const { signal: timeoutSignal, clear } = withTimeout(8_000, signal);
  try {
    const res = await fetch(uri, { method: "HEAD", redirect: "manual", signal: timeoutSignal, cache: "no-store" });
    const location = res.headers.get("location");
    return location ? new URL(location, uri).toString() : uri;
  } catch {
    return uri;
  } finally {
    clear();
  }
}

export function createGeminiProvider(apiKey: string): AIProvider {
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  const fastModel = process.env.GEMINI_FAST_MODEL || GEMINI_FAST_MODEL;
  return {
    id: "gemini",
    label: "Gemini",
    model,
    async query(prompt, opts = {}) {
      const started = Date.now();
      const raw = await callGenerate(
        apiKey,
        model,
        { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] },
        opts.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
        opts.signal
      );
      const candidate = raw.candidates?.[0];
      const partTexts = (candidate?.content?.parts ?? []).map((p) => p.text ?? "");
      const text = partTexts.join("");
      if (!text) throw new ProviderError("gemini", "Gemini returned no text output");

      const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
      const resolved = await Promise.all(chunks.map((c) => (c.web?.uri ? resolveRedirect(c.web.uri, opts.signal) : Promise.resolve(null))));
      const citations: ProviderCitation[] = [];
      const supports = candidate?.groundingMetadata?.groundingSupports ?? [];
      for (const s of supports) {
        const { start, end } = segmentSpan(s.segment, partTexts);
        for (const idx of s.groundingChunkIndices ?? []) {
          const url = resolved[idx];
          if (!url) continue;
          citations.push({ url, title: chunks[idx]?.web?.title ?? null, start, end, citedText: s.segment?.text ?? null });
        }
      }
      if (citations.length === 0) {
        chunks.forEach((c, idx) => {
          const url = resolved[idx];
          if (url) citations.push({ url, title: c.web?.title ?? null, start: null, end: null, citedText: null });
        });
      }
      return { engine: "gemini", model, answerText: text, citations, latencyMs: Date.now() - started, rawResponse: raw };
    },
    async complete(system, user, opts = {}) {
      const started = Date.now();
      const raw = await callGenerate(
        apiKey,
        fastModel,
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json" },
        },
        opts.timeoutMs ?? DEFAULT_COMPLETION_TIMEOUT_MS,
        opts.signal
      );
      const text = (raw.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      return { engine: "gemini", model: fastModel, text, latencyMs: Date.now() - started };
    },
    async health() {
      // A model can be listed yet refuse generation, so the check makes one minimal generation call.
      const { signal, clear } = withTimeout(15_000);
      try {
        const res = await fetch(`${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }], generationConfig: { maxOutputTokens: 5 } }),
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
