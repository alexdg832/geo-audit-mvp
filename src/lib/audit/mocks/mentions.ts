import { SeededRandom } from "../seed";
import { MockMention } from "../types";

/**
 * TODO(real integration): replace this with real search/mention discovery,
 * e.g. a search API (Google/Bing) plus an LLM pass to classify source tier
 * and check factual accuracy against the business's Truth Brief.
 */

const TIER1_TEMPLATES = [
  { name: "Google Business Profile", url: null },
  { name: "Better Business Bureau (BBB)", url: "https://www.bbb.org" },
  { name: "Wikipedia", url: "https://en.wikipedia.org" },
  { name: "Local Government Business Registry", url: null },
  { name: "National Industry Association Directory", url: null },
  { name: "City Herald — local news", url: null },
];

const TIER2_TEMPLATES = [
  { name: "Yelp", url: "https://www.yelp.com" },
  { name: "Chamber of Commerce Member Directory", url: null },
  { name: "Niche Industry Directory Listing", url: null },
  { name: "Local Blog Feature", url: null },
  { name: "Press Release Wire", url: null },
];

const TIER3_TEMPLATES = [
  { name: "Reddit — r/smallbusiness thread", url: "https://www.reddit.com" },
  { name: "Anonymous review site", url: null },
  { name: "Random forum post", url: null },
  { name: "Facebook comment thread", url: "https://www.facebook.com" },
  { name: "X (Twitter) reply thread", url: "https://x.com" },
];

const ACCURATE_SNIPPETS = [
  "Confirms the business's name, location, and services match public records.",
  "Describes the business accurately, matching its official listing.",
  "Cites the correct hours and contact details.",
];

const INACCURATE_SNIPPETS = [
  "Lists an outdated address that no longer matches the business's current location.",
  "Confuses this business with a similarly named company in another city.",
  "Repeats an old phone number that's no longer in service.",
  "Claims the business closed, which is out of date.",
];

export function generateMockMentions(businessName: string, website: string | null): MockMention[] {
  const rng = new SeededRandom(`mentions:${businessName}:${website ?? ""}`);
  const mentions: MockMention[] = [];

  if (website) {
    mentions.push({
      name: `${businessName} — Official Website`,
      url: website,
      tier: 1,
      snippet: "The business's own site, treated as the primary source of truth.",
      accurate: true,
    });
  }

  const tier1Count = rng.int(2, 4);
  for (const t of rng.pickMany(TIER1_TEMPLATES, tier1Count)) {
    mentions.push({
      name: t.name,
      url: t.url,
      tier: 1,
      snippet: rng.pick(ACCURATE_SNIPPETS),
      accurate: true,
    });
  }

  const tier2Count = rng.int(2, 4);
  for (const t of rng.pickMany(TIER2_TEMPLATES, tier2Count)) {
    const accurate = rng.bool(0.75);
    mentions.push({
      name: t.name,
      url: t.url,
      tier: 2,
      snippet: accurate ? rng.pick(ACCURATE_SNIPPETS) : rng.pick(INACCURATE_SNIPPETS),
      accurate,
    });
  }

  const tier3Count = rng.int(1, 4);
  for (const t of rng.pickMany(TIER3_TEMPLATES, tier3Count)) {
    const accurate = rng.bool(0.25);
    mentions.push({
      name: t.name,
      url: t.url,
      tier: 3,
      snippet: accurate ? rng.pick(ACCURATE_SNIPPETS) : rng.pick(INACCURATE_SNIPPETS),
      accurate,
    });
  }

  return mentions;
}
