import * as cheerio from "cheerio";
import { isEntityType } from "./entityTypes";
import { domainOf, normalizeWebsiteUrl, safeFetch } from "./fetcher";
import { AI_USER_AGENTS, isAllowed, parseRobots } from "./robots";

export interface SiteScanResult {
  url: string | null;
  fetchOk: boolean;
  fetchError: string | null;
  httpStatus: number | null;
  finalUrl: string | null;
  https: boolean;
  responseMs: number | null;
  htmlBytes: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  wordCount: number | null;
  textRatio: number | null;
  jsRequired: boolean | null;
  metaRobots: string | null;
  schemaTypes: string[];
  schemaHasNap: boolean | null;
  hasAboutPage: boolean | null;
  hasContactInfo: boolean | null;
  detectedPhone: string | null;
  detectedAddress: string | null;
  hasHours: boolean | null;
  hasFaq: boolean | null;
  lastModified: string | null;
  robotsFound: boolean | null;
  robots: Record<string, boolean> | null;
  robotsDedicated: string[];
  llmsTxtFound: boolean | null;
  sitemapFound: boolean | null;
  /** The sitemap that actually answered with a urlset/sitemapindex; null when none did. */
  sitemapUrl: string | null;
  /** Every Sitemap: directive found in robots.txt, live or not. Optional because persisted `raw` rows from earlier scans lack it. */
  robotsSitemaps?: string[];
  categoryHint: string | null;
  /** Fields that could not be determined (fetch failures), so scoring can lower confidence instead of penalising. */
  unknown: string[];
}

const PHONE_REGEX = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const ADDRESS_REGEX =
  /\b\d{1,6}\s+[A-Za-z0-9.'\s]{2,40}?\s(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy|Suite|Ste)\b\.?(?:[,\s]+(?:Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+)?/i;

const TIME = String.raw`(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2})`;
const TIME_RANGE = String.raw`${TIME}\s*(?:[-–—]|to|until|till|through|thru)\s*${TIME}`;
const DAY = String.raw`(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?|m\s*[-–—]\s*f`;
/** "Mon–Fri 9am–5pm", "Monday: 9:00 AM - 5:00 PM". A start AND end time is required so an event time ("Sat 7pm concert") does not count. */
// One filler word is tolerated between the day part and the time range ("Mon-Fri from 9am to 5pm").
const DAY_HOURS_REGEX = new RegExp(String.raw`\b(?:${DAY})\s*(?:(?:[-–—]|to|through|thru)\s*(?:${DAY}))?\s*[:\s]*(?:(?:from|open|hours?|are|is)\s+)?${TIME_RANGE}`, "i");
/** "Open daily 9am-5pm", "Hours: 9:00 AM - 5:00 PM", "We are open every day from 8am to 6pm". */
const LABEL_HOURS_REGEX = new RegExp(String.raw`\b(?:hours?|open|opening|daily|every ?day|weekdays|weekends|7 days a week)\b[^.\n]{0,40}?${TIME_RANGE}`, "i");
/** "Open 24 hours", "24/7 emergency service". */
const ALWAYS_OPEN_REGEX = /\b(?:open\s+24\s*(?:hours|hrs)|24\s*(?:hours|hrs)\s+a\s+day|24\s*\/\s*7)\b/i;

/** True when visible page text states opening hours (not merely a time). */
export function detectHoursInText(text: string): boolean {
  return DAY_HOURS_REGEX.test(text) || LABEL_HOURS_REGEX.test(text) || ALWAYS_OPEN_REGEX.test(text);
}

const CATEGORY_OVERRIDES: Record<string, string> = {
  HVACBusiness: "HVAC company",
  CafeOrCoffeeShop: "coffee shop",
  BarOrPub: "bar",
  ExerciseGym: "gym",
  HealthClub: "gym",
  SportsActivityLocation: "sports facility",
  SportsClub: "sports club",
  Attorney: "law firm",
  LegalService: "law firm",
  Physician: "doctor",
  MedicalClinic: "medical clinic",
  MedicalBusiness: "medical practice",
  RealEstateAgent: "real estate agent",
  GeneralContractor: "general contractor",
  HomeAndConstructionBusiness: "home services company",
  ProfessionalService: "professional service",
  LodgingBusiness: "hotel",
  FoodEstablishment: "restaurant",
  FastFoodRestaurant: "fast food restaurant",
  HealthAndBeautyBusiness: "beauty business",
  AutomotiveBusiness: "auto shop",
  AutoRepair: "auto repair shop",
  FinancialService: "financial services firm",
  AccountingService: "accounting firm",
  InsuranceAgency: "insurance agency",
  EntertainmentBusiness: "entertainment venue",
  ChildCare: "child care center",
  DryCleaningOrLaundry: "dry cleaner",
  VeterinaryCare: "veterinarian",
  MovingCompany: "moving company",
  RoofingContractor: "roofing contractor",
  HousePainter: "painting contractor",
  SelfStorage: "self storage facility",
  EducationalOrganization: "school",
  School: "school",
  Store: "store",
};

const GENERIC_TYPES = new Set(["LocalBusiness", "Organization", "Corporation", "Thing", "WebSite", "WebPage"]);

function categoryFromType(type: string): string | null {
  if (GENERIC_TYPES.has(type)) return null;
  if (CATEGORY_OVERRIDES[type]) return CATEGORY_OVERRIDES[type];
  return type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function collectNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj["@type"]) out.push(obj);
    for (const [key, value] of Object.entries(obj)) {
      if (key === "@context") continue;
      if (value && typeof value === "object") collectNodes(value, out);
    }
  }
}

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t.replace(/^https?:\/\/schema\.org\//, "")];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string").map((x) => x.replace(/^https?:\/\/schema\.org\//, ""));
  return [];
}

function stringField(node: Record<string, unknown>, key: string): string | null {
  const v = node[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function addressText(node: Record<string, unknown>): string | null {
  const addr = node.address;
  if (typeof addr === "string") return addr;
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    const parts = ["streetAddress", "addressLocality", "addressRegion", "postalCode"].map((k) => stringField(a, k)).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

function hasNap(node: Record<string, unknown>): boolean {
  return Boolean(stringField(node, "telephone") || addressText(node));
}

/** Entity types that say nothing about what the business is; Yoast emits one for every site. */
const GENERIC_ENTITY_TYPES = new Set(["Organization", "Corporation", "Thing"]);

/**
 * Orders entity nodes so the one that best describes the business comes first: a node
 * carrying a phone or address, then a specifically typed business (Dentist, Plumber,
 * LocalBusiness) over a bare Organization, then document order. Without this, a Yoast
 * Organization graph placed before the real LocalBusiness node hid its NAP and hours.
 */
function rankEntityNodes(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  const score = (n: Record<string, unknown>): number =>
    (hasNap(n) ? 2 : 0) + (typesOf(n).some((t) => isEntityType(t) && !GENERIC_ENTITY_TYPES.has(t)) ? 1 : 0);
  return nodes
    .map((n, i) => ({ n, i, s: score(n) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.n);
}

function emptyResult(url: string | null): SiteScanResult {
  return {
    url,
    fetchOk: false,
    fetchError: null,
    httpStatus: null,
    finalUrl: null,
    https: false,
    responseMs: null,
    htmlBytes: null,
    title: null,
    metaDescription: null,
    h1: null,
    wordCount: null,
    textRatio: null,
    jsRequired: null,
    metaRobots: null,
    schemaTypes: [],
    schemaHasNap: null,
    hasAboutPage: null,
    hasContactInfo: null,
    detectedPhone: null,
    detectedAddress: null,
    hasHours: null,
    hasFaq: null,
    lastModified: null,
    robotsFound: null,
    robots: null,
    robotsDedicated: [],
    llmsTxtFound: null,
    sitemapFound: null,
    sitemapUrl: null,
    robotsSitemaps: [],
    categoryHint: null,
    unknown: [],
  };
}

/** Fetches the homepage, robots.txt, llms.txt and sitemap and evaluates AI-readiness signals. */
export async function scanSite(websiteInput: string | null): Promise<SiteScanResult> {
  if (!websiteInput) return emptyResult(null);
  const url = normalizeWebsiteUrl(websiteInput);
  if (!url) return { ...emptyResult(websiteInput), fetchError: "Could not parse the website address." };

  const result = emptyResult(url);
  let page = await safeFetch(url);
  if (!page.ok && !page.status && url.startsWith("https://") && !/^https?:\/\//i.test(websiteInput.trim())) {
    const httpUrl = `http://${url.slice("https://".length)}`;
    const retry = await safeFetch(httpUrl);
    if (retry.ok) page = retry;
  }

  result.httpStatus = page.status;
  result.finalUrl = page.finalUrl;
  result.responseMs = page.ttfbMs;
  result.https = page.finalUrl.startsWith("https://");

  if (!page.ok) {
    result.fetchError = page.error ?? `HTTP ${page.status}`;
    result.unknown.push("homepage");
    return result;
  }
  result.fetchOk = true;
  result.htmlBytes = page.bytes;

  const $ = cheerio.load(page.body);
  result.title = $("title").first().text().trim() || null;
  result.metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  result.h1 = $("h1").first().text().replace(/\s+/g, " ").trim() || null;
  result.metaRobots = $('meta[name="robots"]').attr("content")?.trim() || page.headers["x-robots-tag"] || null;
  result.lastModified =
    $('meta[property="article:modified_time"]').attr("content") ||
    $('meta[name="last-modified"]').attr("content") ||
    page.headers["last-modified"] ||
    null;

  const nodes: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectNodes(JSON.parse($(el).contents().text()), nodes);
    } catch {
      // malformed JSON-LD is ignored
    }
  });
  const schemaTypes = Array.from(new Set(nodes.flatMap(typesOf)));
  result.schemaTypes = schemaTypes;
  const entityNodes = rankEntityNodes(nodes.filter((n) => typesOf(n).some((t) => isEntityType(t))));
  const primary = entityNodes[0] ?? null;
  // Phone, address and hours are read across every entity node (best-ranked first), since a
  // site may split them between an Organization node and a LocalBusiness node.
  const schemaPhone = entityNodes.map((n) => stringField(n, "telephone")).find(Boolean) ?? null;
  const schemaAddress = entityNodes.map(addressText).find(Boolean) ?? null;
  result.schemaHasNap = entityNodes.some((n) => Boolean(stringField(n, "name")) && hasNap(n));
  const schemaHours = entityNodes.some((n) => Boolean(n.openingHours || n.openingHoursSpecification));
  result.hasFaq = schemaTypes.includes("FAQPage") || /frequently asked questions|\bFAQs?\b/i.test($("h1,h2,h3").text());
  if (nodes.some((n) => typesOf(n).some((t) => t === "Person" || t === "Article")) && primary && stringField(primary, "dateModified")) {
    result.lastModified = result.lastModified ?? stringField(primary, "dateModified");
  }
  for (const t of schemaTypes) {
    const c = categoryFromType(t);
    if (c && isEntityType(t)) {
      result.categoryHint = c;
      break;
    }
  }

  $("script, style, noscript, template, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  result.wordCount = words;
  result.textRatio = page.bytes > 0 ? Number((Buffer.byteLength(text, "utf8") / page.bytes).toFixed(3)) : null;
  result.jsRequired = words < 60 && page.bytes > 20_000;

  const telHref = $('a[href^="tel:"]').first().attr("href");
  const phoneFromText = text.match(PHONE_REGEX)?.[0] ?? null;
  result.detectedPhone = schemaPhone ?? (telHref ? telHref.replace(/^tel:/i, "").trim() : null) ?? phoneFromText;
  result.detectedAddress = schemaAddress ?? text.match(ADDRESS_REGEX)?.[0] ?? null;
  result.hasContactInfo = Boolean(result.detectedPhone || result.detectedAddress || $('a[href^="mailto:"]').length);
  result.hasHours = schemaHours || detectHoursInText(text);

  const origin = new URL(page.finalUrl).origin;
  const siteDomain = domainOf(page.finalUrl);
  result.hasAboutPage = $("a[href]").toArray().some((el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const u = new URL(href, page.finalUrl);
      return domainOf(u.toString()) === siteDomain && /\/(about|about-us|our-story|team|who-we-are)\b/i.test(u.pathname);
    } catch {
      return false;
    }
  });

  const [robotsRes, llmsRes] = await Promise.all([
    safeFetch(`${origin}/robots.txt`, { maxBytes: 256 * 1024, accept: "text/plain,*/*;q=0.5" }),
    safeFetch(`${origin}/llms.txt`, { maxBytes: 256 * 1024, accept: "text/plain,text/markdown,*/*;q=0.5" }),
  ]);

  if (robotsRes.ok && !/<html|<!doctype/i.test(robotsRes.body.slice(0, 200))) {
    const parsed = parseRobots(robotsRes.body);
    result.robotsFound = true;
    result.robots = Object.fromEntries(AI_USER_AGENTS.map(({ agent }) => [agent, isAllowed(parsed, agent, "/")]));
    result.robotsDedicated = AI_USER_AGENTS.filter(({ agent }) =>
      parsed.groups.some((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().startsWith(a)))
    ).map(({ agent }) => agent);
    result.robotsSitemaps = parsed.sitemaps;
  } else if (robotsRes.status === 404 || (robotsRes.ok && /<html|<!doctype/i.test(robotsRes.body.slice(0, 200)))) {
    result.robotsFound = false;
    result.robots = Object.fromEntries(AI_USER_AGENTS.map(({ agent }) => [agent, true]));
  } else {
    result.unknown.push("robots");
  }

  if (llmsRes.ok) {
    const looksHtml = /<html|<!doctype|<head|<body/i.test(llmsRes.body.slice(0, 500));
    const textType = !llmsRes.contentType || /text\/(plain|markdown)|application\/octet-stream/i.test(llmsRes.contentType);
    result.llmsTxtFound = !looksHtml && textType && llmsRes.body.trim().length > 0;
  } else if (llmsRes.status) {
    result.llmsTxtFound = false;
  } else {
    result.unknown.push("llms");
  }

  // Every robots-listed sitemap (bounded) is tried before the conventional locations, so a
  // stale "Sitemap:" line left by an old plugin cannot hide a live /sitemap.xml. Relative
  // directives are resolved against the site origin.
  const declared = (result.robotsSitemaps ?? []).slice(0, 3).flatMap((s) => {
    try {
      const u = new URL(s, origin);
      return u.protocol === "http:" || u.protocol === "https:" ? [u.toString()] : [];
    } catch {
      return [];
    }
  });
  const candidates = Array.from(new Set([...declared, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]));
  let sawUnknown = false;
  let sawDefinitive = false;
  for (const candidate of candidates) {
    // Shorter per-attempt deadline than the default: up to five sequential fetches must stay
    // well inside the site stage lease.
    const res = await safeFetch(candidate, { maxBytes: 64 * 1024, accept: "application/xml,text/xml,*/*;q=0.5", timeoutMs: 6_000 });
    if (res.ok && /<(urlset|sitemapindex)/i.test(res.body)) {
      result.sitemapFound = true;
      result.sitemapUrl = candidate;
      break;
    }
    if (res.status) sawDefinitive = true;
    else sawUnknown = true;
  }
  if (!result.sitemapFound) {
    result.sitemapUrl = null;
    // A definitive answer (404 on /sitemap.xml) settles it even when a stale declared sitemap host timed out.
    if (sawUnknown && !sawDefinitive) result.unknown.push("sitemap");
    else result.sitemapFound = false;
  }

  return result;
}
