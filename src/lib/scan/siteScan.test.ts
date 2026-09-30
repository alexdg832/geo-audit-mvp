import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeFetchResult } from "./fetcher";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("./fetcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fetcher")>()),
  safeFetch: fetchMock,
}));

import { detectHoursInText, scanSite } from "./siteScan";

const ORIGIN = "https://example.com";

function ok(url: string, body: string, contentType = "text/html"): SafeFetchResult {
  return {
    ok: true,
    status: 200,
    finalUrl: url,
    redirected: false,
    contentType,
    headers: {},
    body,
    bytes: Buffer.byteLength(body, "utf8"),
    truncated: false,
    ttfbMs: 10,
    elapsedMs: 10,
    error: null,
  };
}

function miss(url: string, status: number | null = 404): SafeFetchResult {
  return {
    ok: false,
    status,
    finalUrl: url,
    redirected: false,
    contentType: null,
    headers: {},
    body: "",
    bytes: 0,
    truncated: false,
    ttfbMs: null,
    elapsedMs: 10,
    error: status ? `HTTP ${status}` : "fetch failed",
  };
}

const SITEMAP_XML = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url></urlset>`;

function page(jsonLd: unknown[], bodyText = "Welcome to our site. We are a friendly local team.") {
  const scripts = jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("");
  return `<!doctype html><html><head><title>Example Co</title>${scripts}</head><body><h1>Example Co</h1><p>${bodyText}</p></body></html>`;
}

function route(routes: Record<string, SafeFetchResult>) {
  fetchMock.mockImplementation(async (url: string) => routes[url] ?? miss(url));
}

const YOAST_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: "Example Co", url: ORIGIN, logo: `${ORIGIN}/logo.png` },
    { "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: ORIGIN },
    { "@type": "WebPage", "@id": `${ORIGIN}/#webpage`, url: ORIGIN },
  ],
};

const DENTIST_NODE = {
  "@context": "https://schema.org",
  "@type": "Dentist",
  name: "Example Co",
  telephone: "+1-949-555-0100",
  address: { "@type": "PostalAddress", streetAddress: "123 Main St", addressLocality: "Mission Viejo", addressRegion: "CA", postalCode: "92691" },
  openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "17:00" }],
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe("scanSite JSON-LD entity selection", () => {
  it("reads NAP and hours from a LocalBusiness node even when a Yoast Organization comes first", async () => {
    route({
      [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([YOAST_GRAPH, DENTIST_NODE])),
      [`${ORIGIN}/sitemap.xml`]: ok(`${ORIGIN}/sitemap.xml`, SITEMAP_XML, "application/xml"),
    });
    const result = await scanSite("example.com");
    expect(result.fetchOk).toBe(true);
    expect(result.schemaHasNap).toBe(true);
    expect(result.hasHours).toBe(true);
    expect(result.detectedPhone).toBe("+1-949-555-0100");
    expect(result.detectedAddress).toBe("123 Main St, Mission Viejo, CA, 92691");
    expect(result.categoryHint).toBe("dentist");
  });

  it("merges NAP split across an Organization and a LocalBusiness node", async () => {
    const org = { "@context": "https://schema.org", "@type": "Organization", name: "Example Co", telephone: "+1-949-555-0100" };
    const local = { "@context": "https://schema.org", "@type": "LocalBusiness", name: "Example Co", address: "5 High St, Town" };
    route({ [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([org, local])) });
    const result = await scanSite("example.com");
    expect(result.schemaHasNap).toBe(true);
    expect(result.detectedPhone).toBe("+1-949-555-0100");
    expect(result.detectedAddress).toBe("5 High St, Town");
  });

  it("recognises custom entity types through the shared predicate", async () => {
    const dojo = { "@context": "https://schema.org", "@type": "MartialArtsDojo", name: "Example Co", telephone: "949-555-0100" };
    route({ [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([dojo])) });
    const result = await scanSite("example.com");
    expect(result.schemaHasNap).toBe(true);
    expect(result.categoryHint).toBe("martial arts dojo");
  });

  it("reports no NAP when only a bare Organization exists", async () => {
    route({ [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([YOAST_GRAPH])) });
    const result = await scanSite("example.com");
    expect(result.schemaHasNap).toBe(false);
    expect(result.hasHours).toBe(false);
  });
});

describe("scanSite sitemap discovery", () => {
  const robotsWith = (...sitemaps: string[]) => ok(`${ORIGIN}/robots.txt`, `User-agent: *\nDisallow:\n${sitemaps.map((s) => `Sitemap: ${s}`).join("\n")}\n`, "text/plain");

  it("falls back to /sitemap.xml when the robots-listed sitemap is dead", async () => {
    route({
      [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([])),
      [`${ORIGIN}/robots.txt`]: robotsWith(`${ORIGIN}/sitemap_index.xml`),
      [`${ORIGIN}/sitemap.xml`]: ok(`${ORIGIN}/sitemap.xml`, SITEMAP_XML, "application/xml"),
    });
    const result = await scanSite("example.com");
    expect(result.robotsSitemaps).toEqual([`${ORIGIN}/sitemap_index.xml`]);
    expect(result.sitemapFound).toBe(true);
    expect(result.sitemapUrl).toBe(`${ORIGIN}/sitemap.xml`);
    expect(result.unknown).not.toContain("sitemap");
  });

  it("tries later robots entries and resolves relative directives", async () => {
    route({
      [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([])),
      [`${ORIGIN}/robots.txt`]: robotsWith("https://old.example.net/sitemap.xml", "/wp-sitemap.xml"),
      [`${ORIGIN}/wp-sitemap.xml`]: ok(`${ORIGIN}/wp-sitemap.xml`, SITEMAP_XML, "application/xml"),
    });
    const result = await scanSite("example.com");
    expect(result.sitemapFound).toBe(true);
    expect(result.sitemapUrl).toBe(`${ORIGIN}/wp-sitemap.xml`);
  });

  it("nulls sitemapUrl when nothing answers with a sitemap", async () => {
    route({
      [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([])),
      [`${ORIGIN}/robots.txt`]: robotsWith(`${ORIGIN}/sitemap_index.xml`),
      [`${ORIGIN}/sitemap_index.xml`]: ok(`${ORIGIN}/sitemap_index.xml`, "<!doctype html><html><body>Not found</body></html>"),
    });
    const result = await scanSite("example.com");
    expect(result.sitemapFound).toBe(false);
    expect(result.sitemapUrl).toBeNull();
    const tried = fetchMock.mock.calls.map((c) => c[0] as string).filter((u) => /sitemap/.test(u));
    expect(tried).toEqual([`${ORIGIN}/sitemap_index.xml`, `${ORIGIN}/sitemap.xml`]);
  });

  it("marks the sitemap unknown only when no candidate answered at all", async () => {
    route({
      [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([])),
      [`${ORIGIN}/robots.txt`]: robotsWith("https://dead.example.net/sitemap.xml"),
      ["https://dead.example.net/sitemap.xml"]: miss("https://dead.example.net/sitemap.xml", null),
      [`${ORIGIN}/sitemap.xml`]: miss(`${ORIGIN}/sitemap.xml`, null),
      [`${ORIGIN}/sitemap_index.xml`]: miss(`${ORIGIN}/sitemap_index.xml`, null),
    });
    const result = await scanSite("example.com");
    expect(result.sitemapFound).toBeNull();
    expect(result.sitemapUrl).toBeNull();
    expect(result.unknown).toContain("sitemap");
  });

  it("treats a definitive 404 on the conventional path as 'no sitemap' even if a stale declared host is dead", async () => {
    route({
      [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([])),
      [`${ORIGIN}/robots.txt`]: robotsWith("https://dead.example.net/sitemap.xml"),
      ["https://dead.example.net/sitemap.xml"]: miss("https://dead.example.net/sitemap.xml", null),
      [`${ORIGIN}/sitemap.xml`]: miss(`${ORIGIN}/sitemap.xml`, 404),
      [`${ORIGIN}/sitemap_index.xml`]: miss(`${ORIGIN}/sitemap_index.xml`, 404),
    });
    const result = await scanSite("example.com");
    expect(result.sitemapFound).toBe(false);
    expect(result.unknown).not.toContain("sitemap");
  });
});

describe("scanSite hours in text", () => {
  it("detects hours stated without a day name", async () => {
    route({ [`${ORIGIN}/`]: ok(`${ORIGIN}/`, page([], "Open daily 9am-5pm. Call us.")) });
    expect((await scanSite("example.com")).hasHours).toBe(true);
  });
});

describe("detectHoursInText", () => {
  it("accepts common hour formats", () => {
    for (const text of [
      "Open daily 9am-5pm",
      "Hours: 9:00 AM - 5:00 PM",
      "Hours of operation: 10am–7pm",
      "We are open every day from 8am to 6pm",
      "Weekdays 9am-5pm",
      "Mon–Fri 9am–5pm, Sat 10am–2pm",
      "Monday - Friday: 9:00am - 5:00pm",
      "Mon.-Fri. 9 a.m. to 5 p.m.",
      "M-F 8am-6pm",
      "Open 24 hours",
      "24/7 emergency service",
      "Monday 09:00-17:00",
    ]) {
      expect(detectHoursInText(text), text).toBe(true);
    }
  });

  it("ignores single event times and unrelated numbers", () => {
    for (const text of [
      "Join us Sat 7pm for the concert",
      "Monday 9am",
      "Call 949-555-0100 today",
      "Founded in 1998, over 20 years of service",
      "Open house on Saturday",
    ]) {
      expect(detectHoursInText(text), text).toBe(false);
    }
  });
});
