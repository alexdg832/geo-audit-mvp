import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const AUDIT_USER_AGENT =
  "Mozilla/5.0 (compatible; TrueSourceAuditBot/1.0; +https://geo-audit-mvp.vercel.app)";

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number | null;
  finalUrl: string;
  redirected: boolean;
  contentType: string | null;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  truncated: boolean;
  ttfbMs: number | null;
  elapsedMs: number;
  error: string | null;
}

const DEFAULTS: Required<SafeFetchOptions> = {
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 5,
  accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
};

/** Adds a scheme when missing, rejects anything that is not http(s), drops fragments. */
export function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || !url.hostname.includes(".")) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("ff")
  );
}

export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return !isPrivateIPv4(ip);
  if (version === 6) return !isPrivateIPv6(ip);
  return false;
}

/** Rejects loopback, private, link-local and multicast targets before any request is made. */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`Refusing to fetch non-public host ${host}`);
  }
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error(`Refusing to fetch non-public address ${host}`);
    return;
  }
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0) throw new Error(`DNS lookup returned no addresses for ${host}`);
  for (const { address } of addresses) {
    if (!isPublicAddress(address)) throw new Error(`Refusing to fetch ${host}: resolves to non-public address`);
  }
}

async function readCapped(
  res: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<{ body: string; bytes: number; truncated: boolean }> {
  if (!res.body) return { body: "", bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  while (true) {
    if (signal.aborted) throw new Error("Timed out while reading the response body");
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (bytes + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - bytes));
      bytes = maxBytes;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    bytes += value.byteLength;
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { body: new TextDecoder("utf-8", { fatal: false }).decode(merged), bytes, truncated };
}

/**
 * Fetches a public URL with a deadline that covers redirects and the body read,
 * validating every hop against private address ranges and capping the body size.
 * Never throws: failures are reported in the result.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts = { ...DEFAULTS, ...options };
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  let current = url;
  let redirected = false;

  const fail = (error: string, status: number | null = null): SafeFetchResult => ({
    ok: false,
    status,
    finalUrl: current,
    redirected,
    contentType: null,
    headers: {},
    body: "",
    bytes: 0,
    truncated: false,
    ttfbMs: null,
    elapsedMs: Date.now() - started,
    error,
  });

  try {
    for (let hop = 0; hop <= opts.maxRedirects; hop++) {
      let target: URL;
      try {
        target = new URL(current);
      } catch {
        return fail(`Invalid URL: ${current}`);
      }
      if (target.protocol !== "http:" && target.protocol !== "https:") return fail(`Unsupported protocol ${target.protocol}`);
      await assertPublicHost(target.hostname);

      const res = await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "User-Agent": AUDIT_USER_AGENT,
          Accept: opts.accept,
          "Accept-Language": "en-US,en;q=0.8",
        },
      });
      const ttfbMs = Date.now() - started;

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return fail(`Redirect without Location header (${res.status})`, res.status);
        current = new URL(location, target).toString();
        redirected = true;
        await res.body?.cancel();
        continue;
      }

      const { body, bytes, truncated } = await readCapped(res, opts.maxBytes, controller.signal);
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return {
        ok: res.ok,
        status: res.status,
        finalUrl: target.toString(),
        redirected,
        contentType: res.headers.get("content-type"),
        headers,
        body,
        bytes,
        truncated,
        ttfbMs,
        elapsedMs: Date.now() - started,
        error: res.ok ? null : `HTTP ${res.status}`,
      };
    }
    return fail(`Too many redirects (>${opts.maxRedirects})`);
  } catch (err) {
    const message = controller.signal.aborted
      ? `Timed out after ${opts.timeoutMs} ms`
      : err instanceof Error
        ? err.message
        : "Fetch failed";
    return fail(message);
  } finally {
    clearTimeout(timer);
  }
}
