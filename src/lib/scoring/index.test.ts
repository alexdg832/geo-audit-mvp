import { describe, expect, it } from "vitest";
import type { SiteScanResult } from "@/lib/scan/siteScan";
import { CAP_DEFINITIONS, PILLARS, SCORING_VERSION, computeScore, gradeFor } from "./index";
import type { CitationInput, EngineInput, RunInput, ScoringInput } from "./types";

const ENGINES: EngineInput[] = [
  { id: "openai", label: "ChatGPT", status: "live" },
  { id: "anthropic", label: "Claude", status: "live" },
  { id: "gemini", label: "Gemini", status: "live" },
  { id: "perplexity", label: "Perplexity", status: "live" },
];

const KINDS: RunInput["promptKind"][] = ["recommendation", "recommendation", "near_me", "comparison", "brand_direct", "brand_direct"];

let citationSeq = 0;
function cite(tier: 1 | 2 | 3 | 4, own = false): CitationInput {
  citationSeq += 1;
  return { id: `c${citationSeq}`, tier, isBusinessOwned: own, domain: own ? "example.com" : `site${tier}.com` };
}

function runs(decide: (engine: string, promptIndex: number, runIndex: number) => Partial<RunInput> | null): RunInput[] {
  const out: RunInput[] = [];
  for (const engine of ENGINES.map((e) => e.id)) {
    for (let promptIndex = 0; promptIndex < 6; promptIndex++) {
      for (let runIndex = 0; runIndex < 2; runIndex++) {
        const extra = decide(engine, promptIndex, runIndex);
        out.push({
          id: `${engine}-${promptIndex}-${runIndex}`,
          engine,
          promptIndex,
          promptKind: KINDS[promptIndex],
          runIndex,
          status: "complete",
          mentioned: false,
          mentionPosition: null,
          listItemCount: 4,
          sentiment: null,
          accuracy: null,
          noCitations: false,
          citations: [],
          competitorNames: ["Summit Dental"],
          ...extra,
        });
      }
    }
  }
  return out;
}

function site(overrides: Partial<SiteScanResult> = {}): SiteScanResult {
  return {
    url: "https://example.com/",
    fetchOk: true,
    fetchError: null,
    httpStatus: 200,
    finalUrl: "https://example.com/",
    https: true,
    responseMs: 500,
    htmlBytes: 50_000,
    title: "Example Dental — Dentist in Portland, OR",
    metaDescription: "Family dentistry in Portland.",
    h1: "Example Dental",
    wordCount: 600,
    textRatio: 0.2,
    jsRequired: false,
    metaRobots: null,
    schemaTypes: ["Dentist", "PostalAddress"],
    schemaHasNap: true,
    hasAboutPage: true,
    hasContactInfo: true,
    detectedPhone: "(503) 555-0100",
    detectedAddress: "1 Main St, Portland, OR",
    hasHours: true,
    hasFaq: true,
    lastModified: null,
    robotsFound: true,
    robots: Object.fromEntries(["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Googlebot"].map((a) => [a, true])),
    robotsDedicated: [],
    llmsTxtFound: true,
    sitemapFound: true,
    sitemapUrl: "https://example.com/sitemap.xml",
    categoryHint: "dentist",
    unknown: [],
    ...overrides,
  };
}

function input(partial: Partial<ScoringInput>): ScoringInput {
  return { businessName: "Example Dental", engines: ENGINES, runs: [], site: site(), competitors: [], ...partial };
}

describe("scoring model shape", () => {
  it("pillar weights sum to 100", () => {
    expect(PILLARS.reduce((s, p) => s + p.weight, 0)).toBe(100);
  });

  it("every cap is documented", () => {
    expect(CAP_DEFINITIONS.map((c) => c.key).sort()).toEqual(["crawlers_blocked", "no_live_engines", "no_mentions", "site_unreachable"]);
  });

  it("grade bands cover the whole range", () => {
    expect(gradeFor(0).grade).toBe("Critical");
    expect(gradeFor(44).grade).toBe("Poor");
    expect(gradeFor(45).grade).toBe("Fair");
    expect(gradeFor(84).grade).toBe("Strong");
    expect(gradeFor(100).grade).toBe("Dominant");
  });
});

describe("zero-visibility business", () => {
  const zero = input({
    runs: runs(() => ({ mentioned: false, citations: [cite(3), cite(4)] })),
    competitors: [
      { id: "k1", name: "Summit Dental", runCount: 40, mentionCount: 44 },
      { id: "k2", name: "Coastal Smiles", runCount: 20, mentionCount: 21 },
    ],
  });
  const out = computeScore(zero);

  it("is capped and graded Critical or Poor", () => {
    expect(out.caps.map((c) => c.key)).toEqual(["no_mentions"]);
    expect(out.score).toBeLessThanOrEqual(35);
    expect(["Critical", "Poor"]).toContain(out.grade);
  });

  it("scores zero on visibility and blames the evidence", () => {
    const visibility = out.pillars.find((p) => p.key === "ai_visibility")!;
    expect(visibility.score).toBe(0);
    expect(out.criticalFailures[0].key).toBe("invisible");
    expect(out.criticalFailures[0].evidence.runIds?.length).toBe(48);
    expect(out.criticalFailures.some((f) => f.key === "outranked")).toBe(true);
  });

  it("still credits the website signals", () => {
    const technical = out.pillars.find((p) => p.key === "technical_readiness")!;
    expect(technical.score).toBe(10);
    expect(out.uncappedScore).toBeGreaterThan(out.score);
  });

  it("produces a roadmap led by the biggest loss", () => {
    expect(out.roadmap[0].key).toBe("mention_rate");
    expect(out.roadmap[0].steps.length).toBeGreaterThan(0);
    expect(out.costOfInaction.label).toBe("estimate");
    expect(out.costOfInaction.missedDiscoveriesPerMonth).toBe(200);
  });
});

describe("average business", () => {
  const average = input({
    runs: runs((engine, promptIndex, runIndex) => {
      const mentioned = (promptIndex + runIndex + (engine === "gemini" ? 1 : 0)) % 2 === 0;
      return mentioned
        ? { mentioned: true, mentionPosition: 2, sentiment: "positive", accuracy: "accurate", citations: [cite(3), cite(2), cite(4)] }
        : { mentioned: false, citations: [cite(3)] };
    }),
    site: site({ hasFaq: false, llmsTxtFound: false, schemaHasNap: false, responseMs: 1500 }),
    competitors: [{ id: "k1", name: "Summit Dental", runCount: 24, mentionCount: 24 }],
  });
  const out = computeScore(average);

  it("lands in the middle with no caps", () => {
    expect(out.caps).toEqual([]);
    expect(out.score).toBeGreaterThanOrEqual(40);
    expect(out.score).toBeLessThanOrEqual(70);
    expect(["Fair", "Strong"]).toContain(out.grade);
  });

  it("reports the alternating mention pattern as disagreement", () => {
    expect(out.stats.mentionRate).toBeCloseTo(0.5, 5);
    expect(out.stats.disagreementRate).toBe(1);
    expect(out.pillars.find((p) => p.key === "ai_visibility")!.confidence).toBe("low");
  });

  it("traces every lost point to a finding", () => {
    for (const m of out.metrics) {
      expect(m.finding.length).toBeGreaterThan(0);
      expect(m.points + m.pointsLost).toBeCloseTo(m.weight, 5);
    }
    const total = out.metrics.reduce((s, m) => s + m.points, 0);
    expect(Math.round(total)).toBe(out.uncappedScore);
  });
});

describe("strong business", () => {
  const strong = input({
    runs: runs((_engine, promptIndex) => ({
      mentioned: true,
      mentionPosition: promptIndex < 4 ? 1 : 1,
      sentiment: "positive",
      accuracy: "accurate",
      citations: [cite(2), cite(1, true), cite(3)],
    })),
    competitors: [{ id: "k1", name: "Summit Dental", runCount: 10, mentionCount: 10 }],
  });
  const out = computeScore(strong);

  it("is Dominant with no caps or critical failures", () => {
    expect(out.caps).toEqual([]);
    expect(out.score).toBeGreaterThanOrEqual(85);
    expect(out.grade).toBe("Dominant");
    expect(out.criticalFailures).toEqual([]);
    expect(out.confidence).toBe("high");
  });

  it("is deterministic", () => {
    expect(computeScore(strong)).toEqual(out);
    expect(out.version).toBe(SCORING_VERSION);
  });
});

describe("caps", () => {
  it("caps at 40 when no engine is live", () => {
    const out = computeScore(input({ engines: ENGINES.map((e) => ({ ...e, status: "not_configured" as const })), runs: [] }));
    expect(out.caps.map((c) => c.key)).toContain("no_live_engines");
    expect(out.score).toBeLessThanOrEqual(40);
    expect(out.confidence).toBe("low");
  });

  it("caps at 60 when the website cannot be fetched", () => {
    const out = computeScore(
      input({
        runs: runs(() => ({ mentioned: true, mentionPosition: 1, citations: [cite(2)] })),
        site: site({ fetchOk: false, fetchError: "Timed out", httpStatus: null, robots: null, unknown: ["homepage"] }),
      })
    );
    expect(out.caps.map((c) => c.key)).toEqual(["site_unreachable"]);
    expect(out.score).toBeLessThanOrEqual(60);
    expect(out.metrics.filter((m) => m.pillar === "entity_clarity" && m.value === null).length).toBeGreaterThan(0);
  });

  it("caps at 70 when every AI search crawler is blocked", () => {
    const blockedRobots = Object.fromEntries(Object.keys(site().robots!).map((a) => [a, false]));
    const out = computeScore(input({ runs: runs(() => ({ mentioned: true, mentionPosition: 1, citations: [cite(2)] })), site: site({ robots: blockedRobots }) }));
    expect(out.caps.map((c) => c.key)).toEqual(["crawlers_blocked"]);
    expect(out.score).toBeLessThanOrEqual(70);
    expect(out.criticalFailures.some((f) => f.key === "crawlers_blocked")).toBe(true);
  });
});
