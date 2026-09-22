import * as cheerio from "cheerio";
import { WebsiteCheckResult } from "../types";

const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot"] as const;
const FETCH_TIMEOUT_MS = 8000;
const PHONE_REGEX = /(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;
const ADDRESS_HINT_REGEX =
  /\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\s(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Suite|Ste)\b/i;

function emptyResult(url: string | null): WebsiteCheckResult {
  return {
    urlProvided: Boolean(url),
    url,
    fetchOk: false,
    fetchError: null,
    https: false,
    title: null,
    metaDescription: null,
    hasSchemaOrg: false,
    schemaType: null,
    hasAboutPage: false,
    hasVisibleContactInfo: false,
    detectedPhone: null,
    detectedAddressHint: null,
    robots: {
      checked: false,
      gptBotAllowed: true,
      claudeBotAllowed: true,
      perplexityBotAllowed: true,
    },
    hasLlmsTxt: false,
  };
}

function normalizeUrl(input: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const url = new URL(withProtocol);
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "TrueSourceAuditBot/0.1 (+https://truesource.example)" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Parses a robots.txt body and checks whether a given bot's user-agent is disallowed at "/" . */
function isBotAllowed(robotsTxt: string, botName: string): boolean {
  const lines = robotsTxt.split("\n").map((l) => l.trim());
  let matchesBot = false;
  let matchesWildcard = false;
  let disallowedForBot = false;
  let disallowedForWildcard = false;
  let currentAgents: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      // A new block starts; consecutive user-agent lines belong to the same block.
      if (currentAgents.length && !["user-agent"].includes(key)) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      continue;
    }

    if (key === "disallow") {
      const appliesToBot = currentAgents.includes(botName.toLowerCase());
      const appliesToWildcard = currentAgents.includes("*");
      if (appliesToBot) {
        matchesBot = true;
        if (value === "/" || value === "") disallowedForBot = value === "/";
      }
      if (appliesToWildcard) {
        matchesWildcard = true;
        if (value === "/") disallowedForWildcard = true;
      }
    } else if (key !== "allow") {
      currentAgents = [];
    }
  }

  if (matchesBot) return !disallowedForBot;
  if (matchesWildcard) return !disallowedForWildcard;
  return true;
}

export async function checkWebsite(rawUrl: string | null): Promise<WebsiteCheckResult> {
  if (!rawUrl) return emptyResult(null);

  const url = normalizeUrl(rawUrl);
  if (!url) return { ...emptyResult(rawUrl), fetchError: "Could not parse the provided URL." };

  const result = emptyResult(url);
  result.https = url.startsWith("https://");

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      result.fetchError = `Website responded with status ${res.status}`;
      return result;
    }
    result.fetchOk = true;
    const html = await res.text();
    const $ = cheerio.load(html);

    result.title = $("title").first().text().trim() || null;
    result.metaDescription =
      $('meta[name="description"]').attr("content")?.trim() || null;

    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text();
      try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const type = item?.["@type"];
          const types = Array.isArray(type) ? type : [type];
          if (types.some((t) => t === "Organization" || t === "LocalBusiness")) {
            result.hasSchemaOrg = true;
            result.schemaType = types.find((t) => t === "LocalBusiness") ?? "Organization";
          }
        }
      } catch {
        // ignore malformed JSON-LD
      }
    });

    const bodyText = $("body").text().replace(/\s+/g, " ");
    const phoneMatch = bodyText.match(PHONE_REGEX);
    const addressMatch = bodyText.match(ADDRESS_HINT_REGEX);
    result.detectedPhone = phoneMatch ? phoneMatch[0] : null;
    result.detectedAddressHint = addressMatch ? addressMatch[0] : null;
    result.hasVisibleContactInfo = Boolean(phoneMatch || addressMatch);

    result.hasAboutPage = $('a[href*="about" i]').length > 0;

    const origin = new URL(url).origin;

    try {
      const robotsRes = await fetchWithTimeout(`${origin}/robots.txt`);
      if (robotsRes.ok) {
        const robotsTxt = await robotsRes.text();
        result.robots = {
          checked: true,
          gptBotAllowed: isBotAllowed(robotsTxt, "GPTBot"),
          claudeBotAllowed: isBotAllowed(robotsTxt, "ClaudeBot"),
          perplexityBotAllowed: isBotAllowed(robotsTxt, "PerplexityBot"),
        };
      } else {
        result.robots.checked = true; // no robots.txt = everything allowed by default
      }
    } catch {
      // Leave default (assume allowed) if robots.txt is unreachable.
    }

    try {
      const llmsRes = await fetchWithTimeout(`${origin}/llms.txt`);
      result.hasLlmsTxt = llmsRes.ok;
    } catch {
      result.hasLlmsTxt = false;
    }
  } catch (err) {
    result.fetchError =
      err instanceof Error ? err.message : "Could not reach the website.";
  }

  return result;
}
