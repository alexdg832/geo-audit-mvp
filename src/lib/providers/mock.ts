import { SeededRandom } from "@/lib/audit/seed";
import type { AIProvider, CompletionResponse, ProviderCitation, ProviderResponse, QueryOptions } from "./types";

export const MOCK_MARKER = "[MOCK DATA — fixture, not a real engine answer] ";

const COMPETITOR_PREFIXES = ["Summit", "Coastal", "Harbor", "Golden State", "Pacific", "Evergreen", "Lakeside", "Blue Sky", "Cornerstone", "Legacy"];

function competitorNames(category: string | null, rng: SeededRandom): string[] {
  const noun = category ? category.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Services";
  const picks = rng.pickMany(COMPETITOR_PREFIXES, 4);
  return picks.map((p) => `${p} ${noun}`);
}

interface Segment {
  text: string;
  citation?: { url: string; title: string };
}

function buildAnswer(prompt: string, ctx: NonNullable<QueryOptions["mock"]>): { text: string; citations: ProviderCitation[]; mentioned: boolean } {
  const rng = new SeededRandom(`mock:${ctx.businessName}:${ctx.promptIndex}:${ctx.runIndex}`);
  const profile = new SeededRandom(`mock-profile:${ctx.businessName}`).float(0, 1);
  const invisible = profile < 0.3;
  const mentioned = !invisible && rng.bool(0.65);
  const category = ctx.category ?? "business";
  const location = ctx.location ?? "your area";
  const competitors = competitorNames(ctx.category, rng);
  const domain = ctx.businessDomain ?? "example.com";
  const slug = ctx.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const segments: Segment[] = [];
  const isBrand = /what do you know about|what are people saying/i.test(prompt);

  if (isBrand) {
    if (mentioned) {
      segments.push({
        text: `${ctx.businessName} is a ${category} in ${location}. `,
        citation: { url: `https://${domain}/`, title: `${ctx.businessName} — Official site` },
      });
      segments.push({
        text: `Reviewers on Yelp describe friendly staff and flexible scheduling, with an average rating around four stars. `,
        citation: { url: `https://www.yelp.com/biz/${slug}`, title: `${ctx.businessName} - Yelp` },
      });
      if (rng.bool(0.5)) {
        segments.push({
          text: `One Reddit thread claims the business moved locations last year, which may be out of date. `,
          citation: { url: `https://www.reddit.com/r/${slug.slice(0, 12)}/comments/mock/thread/`, title: "Reddit discussion" },
        });
      }
    } else {
      segments.push({ text: `I could not find reliable information about ${ctx.businessName} in ${location}. ` });
      segments.push({
        text: `You may want to check Google Maps or Yelp for current details. `,
        citation: { url: "https://www.google.com/maps", title: "Google Maps" },
      });
    }
  } else {
    segments.push({ text: `Here are well-regarded ${category} options in ${location}:\n` });
    const names = [...competitors.slice(0, 3)];
    if (mentioned) names.splice(rng.int(0, names.length), 0, ctx.businessName);
    names.forEach((name, i) => {
      const own = name === ctx.businessName;
      const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const source = own
        ? { url: `https://www.yelp.com/biz/${slug}`, title: `${name} - Yelp` }
        : rng.bool(0.5)
          ? { url: `https://www.yelp.com/biz/${nameSlug}`, title: `${name} - Yelp` }
          : { url: `https://www.reddit.com/r/local/comments/mock/${nameSlug}/`, title: `Best ${category} near ${location}? - Reddit` };
      segments.push({
        text: `${i + 1}. ${name} — praised for ${rng.pick(["experienced instructors", "clear pricing", "a welcoming atmosphere", "strong reviews", "convenient hours"])}.\n`,
        citation: source,
      });
    });
    segments.push({ text: `Consider visiting a couple of them before deciding.` });
  }

  let text = MOCK_MARKER;
  const citations: ProviderCitation[] = [];
  for (const seg of segments) {
    const start = text.length;
    text += seg.text;
    if (seg.citation) {
      citations.push({ url: seg.citation.url, title: seg.citation.title, start, end: text.length, citedText: null });
    }
  }
  return { text, citations, mentioned };
}

export const mockProvider: AIProvider = {
  id: "mock",
  label: "Mock engine",
  model: "mock-fixture-v1",
  async query(prompt, opts = {}) {
    const started = Date.now();
    const ctx = opts.mock ?? {
      businessName: "Unknown Business",
      businessDomain: null,
      category: null,
      location: null,
      promptIndex: 0,
      runIndex: 0,
    };
    const { text, citations } = buildAnswer(prompt, ctx);
    await new Promise((r) => setTimeout(r, 150));
    const response: ProviderResponse = {
      engine: "mock",
      model: this.model,
      answerText: text,
      citations,
      latencyMs: Date.now() - started,
      rawResponse: { mock: true, prompt, context: ctx },
    };
    return response;
  },
  async complete(system, user) {
    const started = Date.now();
    const answerMatch = user.match(/<<<\n([\s\S]*?)\n>>>/);
    const answer = answerMatch ? answerMatch[1] : "";
    const targetMatch = user.match(/^TARGET BUSINESS: ([^\n(]+?)(?: \(|,|\n)/m);
    const target = targetMatch ? targetMatch[1].trim() : "";
    const listed = Array.from(answer.matchAll(/^\d+\.\s+([^—\n]+?)\s+—/gm)).map((m) => m[1].trim());
    const brandMentioned = target ? answer.includes(target) && !/could not find reliable information/i.test(answer) : false;
    const businesses = listed.length
      ? listed.map((name) => ({ name, domain: null, isTarget: name === target }))
      : brandMentioned
        ? [{ name: target, domain: null, isTarget: true }]
        : [];
    const mentioned = businesses.some((b) => b.isTarget);
    const out = {
      mentioned,
      sentiment: mentioned ? (answer.includes("out of date") ? "mixed" : "positive") : "not_applicable",
      accuracy: mentioned ? (answer.includes("out of date") ? "inaccurate" : "unverifiable") : "not_applicable",
      accuracyNotes: mentioned && answer.includes("out of date") ? "Claims the business moved locations last year." : "",
      businesses,
    };
    const response: CompletionResponse = {
      engine: "mock",
      model: this.model,
      text: JSON.stringify(out),
      latencyMs: Date.now() - started,
    };
    void system;
    return response;
  },
  async health() {
    return { ok: true, message: "Mock engine (fixtures)" };
  },
};
