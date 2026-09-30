import { lookup } from "node:dns/promises";
import { createServer, type Server } from "node:http";
import { fetch as undiciFetch } from "undici";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  assertPublicHost,
  createPinnedDispatcher,
  createPinnedLookup,
  isPublicAddress,
  safeFetch,
  type ResolvedAddress,
} from "./fetcher";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

// The fetcher only ever calls the `{ all: true }` overload, so type the mock against that one.
const mockedLookup = vi.mocked(
  lookup as unknown as (hostname: string, options: { all: true }) => Promise<ResolvedAddress[]>
);

afterEach(() => {
  mockedLookup.mockReset();
});

describe("isPublicAddress", () => {
  it("rejects IPv4-mapped IPv6 in both the hex and the dotted spelling", () => {
    for (const ip of [
      "::ffff:7f00:1",
      "::ffff:127.0.0.1",
      "::FFFF:7F00:1",
      "::ffff:a9fe:a9fe",
      "::ffff:169.254.169.254",
      "::ffff:a00:1",
      "::ffff:10.0.0.1",
      "::ffff:c0a8:101",
      "::ffff:192.168.1.1",
      "::ffff:0:0",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("rejects NAT64, IPv4-compatible and 6to4 forms that embed a private IPv4 address", () => {
    for (const ip of [
      "64:ff9b::7f00:1",
      "64:ff9b::127.0.0.1",
      "64:ff9b::a9fe:a9fe",
      "::7f00:1",
      "::127.0.0.1",
      "::a9fe:a9fe",
      "2002:7f00:1::",
      "2002:a9fe:a9fe::1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("rejects loopback, unspecified, ULA, link-local, multicast and anything outside 2000::/3", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%en0", "ff02::1", "100::1", "4000::1", "1::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("accepts global unicast IPv6 and embedded public IPv4 addresses", () => {
    for (const ip of [
      "2001:4860:4860::8888",
      "2606:4700:4700::1111",
      "2001:4860:4860:0:0:0:0:8888",
      "::ffff:8.8.8.8",
      "::ffff:808:808",
      "64:ff9b::808:808",
      "2002:808:808::1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("classifies IPv4 the same way as before", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "0.0.0.0", "100.64.0.1", "224.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "93.184.216.34", "1.1.1.1"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("treats anything that is not an IP literal as non-public", () => {
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("example.com")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

describe("assertPublicHost", () => {
  it("rejects bracketed IPv6 literals exactly as the URL parser serialises them, without touching DNS", async () => {
    const hosts = [
      new URL("http://[::ffff:127.0.0.1]:8080/").hostname, // "[::ffff:7f00:1]"
      new URL("http://[64:ff9b::127.0.0.1]/").hostname, // "[64:ff9b::7f00:1]"
      "[::ffff:7f00:1]",
      "[::ffff:a9fe:a9fe]",
      "[::ffff:127.0.0.1]",
      "[64:ff9b::7f00:1]",
      "[::1]",
      "127.0.0.1",
      "169.254.169.254",
    ];
    for (const host of hosts) {
      await expect(assertPublicHost(host), host).rejects.toThrow(/non-public/);
    }
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it("rejects local names without a DNS lookup", async () => {
    for (const host of ["localhost", "db.localhost", "printer.local", "metadata.internal"]) {
      await expect(assertPublicHost(host), host).rejects.toThrow(/non-public/);
    }
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it("returns a public literal as the pinned address", async () => {
    await expect(assertPublicHost("93.184.216.34")).resolves.toEqual([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertPublicHost("[2606:4700:4700::1111]")).resolves.toEqual([
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  });

  it("returns every validated address for a name that resolves publicly", async () => {
    const answers: ResolvedAddress[] = [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
    ];
    mockedLookup.mockResolvedValueOnce(answers);
    await expect(assertPublicHost("Example.com")).resolves.toEqual(answers);
    expect(mockedLookup).toHaveBeenCalledWith("example.com", { all: true });
  });

  it("rejects a name when any answer is private, including a mapped AAAA record", async () => {
    mockedLookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "::ffff:7f00:1", family: 6 },
    ]);
    await expect(assertPublicHost("rebind.example")).rejects.toThrow(/non-public/);
    mockedLookup.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertPublicHost("intranet.example")).rejects.toThrow(/non-public/);
    mockedLookup.mockResolvedValueOnce([]);
    await expect(assertPublicHost("nowhere.example")).rejects.toThrow(/no addresses/);
  });
});

describe("createPinnedLookup", () => {
  const pins = new Map<string, ResolvedAddress[]>([
    [
      "example.com",
      [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
      ],
    ],
  ]);
  const pinned = createPinnedLookup(pins);
  const call = (hostname: string, options: { all?: boolean; family?: number }) =>
    new Promise<unknown[]>((resolve) => pinned(hostname, options, (...args) => resolve(args)));

  it("answers only from the validated addresses", async () => {
    await expect(call("example.com", { all: true })).resolves.toEqual([null, pins.get("example.com")]);
    await expect(call("EXAMPLE.com", {})).resolves.toEqual([null, "93.184.216.34", 4]);
    await expect(call("example.com", { family: 6 })).resolves.toEqual([
      null,
      "2606:2800:21f:cb07:6820:80da:af6b:8b2c",
      6,
    ]);
    await expect(call("example.com", { all: true, family: 4 })).resolves.toEqual([
      null,
      [{ address: "93.184.216.34", family: 4 }],
    ]);
  });

  it("fails closed for a host that was never validated or has no address of the wanted family", async () => {
    const [err] = await call("other.example", { all: true });
    expect(err).toBeInstanceOf(Error);
    expect((err as NodeJS.ErrnoException).code).toBe("ENOTFOUND");
    const [err2] = await call("example.com", { family: 5 });
    expect(err2).toBeNull();
  });
});

describe("with a loopback HTTP server", () => {
  let server: Server;
  let port: number;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(`${req.headers.host ?? ""} ${req.url ?? ""}`);
      res.setHeader("content-type", "text/plain");
      res.end("loopback ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("safeFetch refuses every loopback spelling before opening a connection", async () => {
    const urls = [
      `http://[::ffff:7f00:1]:${port}/`,
      `http://[::ffff:127.0.0.1]:${port}/`,
      `http://[64:ff9b::7f00:1]:${port}/`,
      `http://[::7f00:1]:${port}/`,
      `http://127.0.0.1:${port}/`,
      `http://0x7f000001:${port}/`,
      `http://localhost:${port}/`,
    ];
    for (const url of urls) {
      const result = await safeFetch(url, { timeoutMs: 2_000 });
      expect(result.ok, url).toBe(false);
      expect(result.status, url).toBeNull();
      expect(result.error, url).toMatch(/non-public/);
    }
    expect(hits).toEqual([]);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it("the pinned dispatcher connects to the validated address while keeping the hostname for Host", async () => {
    // "pinned.test" is never resolved: the only way this request reaches the server is through the pin.
    const pins = new Map<string, ResolvedAddress[]>([["pinned.test", [{ address: "127.0.0.1", family: 4 }]]]);
    const dispatcher = createPinnedDispatcher(pins);
    try {
      const res = await undiciFetch(`http://pinned.test:${port}/pinned`, { dispatcher });
      expect(res.status).toBe(200);
      await expect(res.text()).resolves.toBe("loopback ok");
      expect(hits).toEqual([`pinned.test:${port} /pinned`]);

      await expect(undiciFetch(`http://unpinned.test:${port}/`, { dispatcher })).rejects.toThrow();
      expect(hits).toHaveLength(1);
    } finally {
      await dispatcher.destroy();
    }
  });
});
