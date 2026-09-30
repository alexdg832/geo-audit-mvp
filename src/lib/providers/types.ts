export type EngineId = "openai" | "anthropic" | "gemini" | "perplexity" | "mock";

export const ENGINE_LABELS: Record<EngineId, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  mock: "Mock engine",
};

export const LIVE_ENGINE_IDS: Exclude<EngineId, "mock">[] = ["openai", "anthropic", "gemini", "perplexity"];

export interface ProviderCitation {
  url: string;
  title: string | null;
  /** Character span in answerText that this citation supports, when the engine provides one. */
  start: number | null;
  end: number | null;
  /** Engine-provided excerpt of the source (Anthropic cited_text, Perplexity snippet). */
  citedText: string | null;
}

export interface ProviderResponse {
  engine: EngineId;
  model: string;
  answerText: string;
  citations: ProviderCitation[];
  latencyMs: number;
  rawResponse: unknown;
}

export interface CompletionResponse {
  engine: EngineId;
  model: string;
  text: string;
  latencyMs: number;
}

export interface MockContext {
  businessName: string;
  businessDomain: string | null;
  category: string | null;
  location: string | null;
  promptIndex: number;
  runIndex: number;
}

export interface QueryOptions {
  /** Free-text location used to localise the engine's web search when supported. */
  location?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Read only by the mock engine so fixtures can reference the audited business. */
  mock?: MockContext;
}

export interface AIProvider {
  id: EngineId;
  label: string;
  model: string;
  /** Sends one user prompt with the engine's native web search or grounding enabled. */
  query(prompt: string, opts?: QueryOptions): Promise<ProviderResponse>;
  /** Plain completion without web search, used for answer classification. Absent when the engine cannot search-free. */
  complete?(system: string, user: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<CompletionResponse>;
  /** Cheap liveness check that validates the key without triggering web search. */
  health(): Promise<{ ok: boolean; message?: string }>;
}

export type ProviderStatus = "live" | "not_configured" | "error";

export class ProviderError extends Error {
  readonly engine: EngineId;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(engine: EngineId, message: string, opts: { status?: number | null; retryable?: boolean } = {}) {
    super(message);
    this.name = "ProviderError";
    this.engine = engine;
    this.status = opts.status ?? null;
    this.retryable = opts.retryable ?? false;
  }
}

/** Classifies an HTTP failure from a provider without ever including headers or the request body. */
export function providerHttpError(engine: EngineId, status: number, bodySnippet: string): ProviderError {
  const retryable = status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  const snippet = bodySnippet.replace(/\s+/g, " ").slice(0, 300);
  return new ProviderError(engine, `${engine} responded ${status}: ${snippet}`, { status, retryable });
}
