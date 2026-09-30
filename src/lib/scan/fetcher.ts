import { lookup } from "node:dns/promises";
import { isIP, isIPv4, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from "undici";

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

/** Expands an IPv6 literal to its eight 16-bit groups, folding a trailing dotted IPv4 into the last two. */
function expandIPv6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (halves.length === 2 && fill < 1) return null;
  const groups = [...head, ...new Array<string>(fill).fill("0"), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function ipv4FromGroups(hi: number, lo: number): string {
  return `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
}

function isPrivateIPv6(ip: string): boolean {
  const groups = expandIPv6(ip);
  if (!groups) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const zeroPrefix80 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // IPv4-mapped (::ffff:0:0/96), IPv4-compatible (::/96, which also covers :: and ::1) and NAT64
  // (64:ff9b::/96) addresses embed an IPv4 address in the low 32 bits and the OS connects to that
  // IPv4 address, so classify it instead. Matching on the expanded groups matters because the URL
  // parser rewrites the dotted spelling (::ffff:127.0.0.1) to hex (::ffff:7f00:1).
  if (
    (zeroPrefix80 && (g5 === 0 || g5 === 0xffff)) ||
    (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0)
  ) {
    return isPrivateIPv4(ipv4FromGroups(g6, g7));
  }
  // 6to4 (2002::/16) embeds the IPv4 address in bits 16-47.
  if (g0 === 0x2002) return isPrivateIPv4(ipv4FromGroups(g1, g2));
  // Everything outside global unicast (2000::/3) is loopback, unspecified, ULA, link-local, multicast or reserved.
  return (g0 & 0xe000) !== 0x2000;
}

export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return !isPrivateIPv4(ip);
  if (version === 6) return !isPrivateIPv6(ip);
  return false;
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

/**
 * Rejects loopback, private, link-local and multicast targets before any request is made.
 * Returns the validated addresses so the connection can be pinned to them.
 */
export async function assertPublicHost(hostname: string): Promise<ResolvedAddress[]> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error(`Refusing to fetch non-public host ${host}`);
  }
  const literal = isIP(host);
  if (literal) {
    if (!isPublicAddress(host)) throw new Error(`Refusing to fetch non-public address ${host}`);
    return [{ address: host, family: literal }];
  }
  const addresses = await lookup(host, { all: true });
  if (addresses.length === 0) throw new Error(`DNS lookup returned no addresses for ${host}`);
  for (const { address } of addresses) {
    if (!isPublicAddress(address)) throw new Error(`Refusing to fetch ${host}: resolves to non-public address`);
  }
  return addresses;
}

/**
 * A `net.connect` lookup that only ever answers with addresses assertPublicHost already validated,
 * keyed by lowercase hostname. Without this, the socket would run its own DNS query and a rebinding
 * resolver could hand it a private address after the check passed.
 */
export function createPinnedLookup(pins: ReadonlyMap<string, ResolvedAddress[]>): LookupFunction {
  return (hostname, options, callback) => {
    const wantedFamily = options.family === 4 || options.family === 6 ? options.family : 0;
    const addresses = (pins.get(hostname.toLowerCase()) ?? []).filter(
      (a) => wantedFamily === 0 || a.family === wantedFamily
    );
    // Node's own dns.lookup answers asynchronously, so do the same to avoid re-entrancy in net.connect.
    process.nextTick(() => {
      if (addresses.length === 0) {
        const err: NodeJS.ErrnoException = new Error(`Refusing to connect to unvalidated host ${hostname}`);
        err.code = "ENOTFOUND";
        callback(err, "");
      } else if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
}

/** An undici Agent whose sockets connect only to pinned addresses while keeping the hostname for Host and SNI. */
export function createPinnedDispatcher(pins: ReadonlyMap<string, ResolvedAddress[]>): Agent {
  return new Agent({ connect: { lookup: createPinnedLookup(pins) } });
}

async function readCapped(
  res: UndiciResponse,
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
 * Each hop connects only to the addresses that passed validation (DNS pinning).
 * Never throws: failures are reported in the result.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts = { ...DEFAULTS, ...options };
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const pins = new Map<string, ResolvedAddress[]>();
  // undici's own fetch honours the dispatcher and bypasses Next's patched global fetch (no Data Cache).
  const dispatcher = createPinnedDispatcher(pins);
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
      pins.set(target.hostname.toLowerCase(), await assertPublicHost(target.hostname));

      const res = await undiciFetch(target, {
        redirect: "manual",
        signal: controller.signal,
        dispatcher,
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
    // The agent is per call, so no pinned socket outlives the validation it was made under.
    await dispatcher.destroy().catch(() => undefined);
  }
}
