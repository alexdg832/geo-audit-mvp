import { createHash } from "node:crypto";
import { ProviderError } from "./types";

export const DEFAULT_QUERY_TIMEOUT_MS = 60_000;
export const DEFAULT_COMPLETION_TIMEOUT_MS = 30_000;

export function withTimeout(timeoutMs: number, outer?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs);
  const onOuterAbort = () => controller.abort(outer?.reason);
  outer?.addEventListener("abort", onOuterAbort, { once: true });
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuterAbort);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries retryable provider errors (429, 5xx, network) with exponential backoff and jitter. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries?: number; baseMs?: number; signal?: AbortSignal } = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 800;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) throw lastError ?? new Error("Aborted");
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof ProviderError ? err.retryable : isNetworkError(err);
      if (!retryable || attempt === retries) throw err;
      await sleep(baseMs * 2 ** attempt + Math.floor(Math.random() * 250));
    }
  }
  throw lastError;
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return false;
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up|network/i.test(err.message);
}

/** Stable, keyed hash of a client IP for rate limiting; the raw address is never stored. */
export function hashClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const secret = process.env.SESSION_SECRET ?? "";
  return createHash("sha256").update(`${secret}:${ip.trim()}`).digest("hex").slice(0, 32);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** YYYY-MM-DD in UTC, the day component of the provider cache key. */
export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
