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

const mentionedEverywhere = () => runs(() => ({ mentioned: true, mentionPosition: 1, accuracy: "accurate", citations: [cite(2), cite(1, true)] }));
const find = (out: ReturnType<typeof computeScore>, key: string) => out.metrics.find((m) => m.metric === key)!;

describe("structured data types", () => {
  it("credits every LocalBusiness subtype the site scan recognises as the entity node", () => {
    const out = computeScore(input({ runs: mentionedEverywhere(), site: site({ schemaTypes: ["SportsActivityLocation", "PostalAddress"] }) }));
    const schema = find(out, "schema_present");
    expect(schema.value).toBe(1);
    expect(schema.finding).toContain("SportsActivityLocation");
    expect(out.criticalFailures.some((f) => f.key === "no_schema")).toBe(false);
  });

  it("still flags a page whose only JSON-LD is not a business entity, costing both schema metrics", () => {
    const out = computeScore(input({ runs: mentionedEverywhere(), site: site({ schemaTypes: ["WebPage", "BreadcrumbList"], schemaHasNap: false }) }));
    expect(find(out, "schema_present").value).toBe(0);
    const failure = out.criticalFailures.find((f) => f.key === "no_schema")!;
    expect(failure.pointsLost).toBe(8);
  });
});

describe("engines that tripped after answering", () => {
  const onlyOpenAiTripped = ENGINES.map((e) => ({ ...e, status: e.id === "openai" ? ("error" as const) : ("not_configured" as const) }));

  it("keeps a single tripped engine's completed answers measured", () => {
    const out = computeScore(
      input({
        engines: onlyOpenAiTripped,
        runs: runs((engine, promptIndex) => (engine !== "openai" ? { status: "pending" } : promptIndex === 5 ? { status: "failed" } : { mentioned: promptIndex < 4, mentionPosition: promptIndex < 4 ? 1 : null, citations: [cite(2)] })),
      })
    );
    expect(out.caps).toEqual([]);
    expect(out.stats.liveEngines).toBe(1);
    expect(out.stats.completedRuns).toBe(10);
    const coverage = find(out, "engine_coverage");
    expect(coverage.value).toBe(1);
    expect(coverage.finding).toContain("1 of 1 engines");
    expect(find(out, "mention_rate").finding).toContain("8 of 10 answers");
    expect(out.criticalFailures.some((f) => f.key === "no_live_engines")).toBe(false);
    expect(out.verdict).not.toContain("unmeasured");
  });

  it("counts an engine that mentioned the business before tripping", () => {
    const engines = ENGINES.map((e) => ({ ...e, status: e.id === "openai" ? ("error" as const) : e.id === "anthropic" ? ("live" as const) : ("not_configured" as const) }));
    const out = computeScore(input({ engines, runs: runs((engine) => (engine === "openai" || engine === "anthropic" ? { mentioned: true, mentionPosition: 1, citations: [cite(2)] } : { status: "pending" })) }));
    const coverage = find(out, "engine_coverage");
    expect(coverage.value).toBe(1);
    expect(coverage.finding).toContain("2 of 2 engines");
    expect(out.stats.liveEngines).toBe(2);
  });

  it("treats live engines that returned no answer as unmeasured", () => {
    const out = computeScore(input({ runs: runs(() => ({ status: "skipped" })) }));
    expect(out.caps.map((c) => c.key)).toEqual(["no_live_engines"]);
    for (const key of ["mention_rate", "prominence", "engine_coverage"]) {
      expect(find(out, key).value).toBeNull();
      expect(find(out, key).finding).toContain("No engine answers were collected");
    }
    expect(out.criticalFailures[0].key).toBe("no_live_engines");
    expect(out.criticalFailures[0].detail).toContain("No engine returned an answer");
    expect(out.verdict).toContain("returned an answer");
  });
});

describe("critical failure points", () => {
  const weakTechnical = { sitemapFound: false, llmsTxtFound: false, responseMs: 2500 };

  it("does not raise a crawler failure when only training crawlers are blocked", () => {
    const out = computeScore(input({ runs: mentionedEverywhere(), site: site({ ...weakTechnical, robots: { ...site().robots!, "Google-Extended": false } }) }));
    expect(out.criticalFailures.some((f) => f.key === "crawlers_blocked")).toBe(false);
    expect(find(out, "crawler_access").pointsLost).toBe(0.4);
    expect(out.roadmap.some((r) => r.key === "crawler_access")).toBe(true);
  });

  it("charges a blocked search crawler only its own metric's points", () => {
    const out = computeScore(input({ runs: mentionedEverywhere(), site: site({ ...weakTechnical, robots: { ...site().robots!, "OAI-SearchBot": false, GPTBot: false } }) }));
    const failure = out.criticalFailures.find((f) => f.key === "crawlers_blocked")!;
    expect(failure.pointsLost).toBe(0.8);
    expect(failure.detail).toContain("disallows OAI-SearchBot");
    expect(failure.detail).toContain("training-only crawlers GPTBot");
    const technical = out.pillars.find((p) => p.key === "technical_readiness")!;
    expect(technical.weight - technical.score).toBeCloseTo(3.8, 5);
  });

  it("charges each failure the metrics it describes and orders by that loss", () => {
    const out = computeScore(
      input({
        runs: runs((_engine, promptIndex) => ({ mentioned: true, mentionPosition: 1, accuracy: promptIndex % 2 ? "inaccurate" : "accurate", citations: [cite(4), cite(4), cite(3)] })),
        site: site({ schemaTypes: [], schemaHasNap: false }),
      })
    );
    expect(out.criticalFailures.find((f) => f.key === "inaccurate")!.pointsLost).toBe(1);
    expect(out.criticalFailures.find((f) => f.key === "no_schema")!.pointsLost).toBe(8);
    expect(out.criticalFailures.find((f) => f.key === "low_trust_sources")!.pointsLost).toBe(10);
    const losses = out.criticalFailures.map((f) => f.pointsLost);
    expect(losses).toEqual([...losses].sort((a, b) => b - a));
  });

  it("charges an unreachable or missing website every site-derived metric but not fact accuracy", () => {
    const unreachable = computeScore(input({ runs: mentionedEverywhere(), site: site({ fetchOk: false, fetchError: "Timed out", httpStatus: null, robots: null, unknown: ["homepage"] }) }));
    expect(unreachable.criticalFailures.find((f) => f.key === "site_unreachable")!.pointsLost).toBe(38);
    const none = computeScore(input({ runs: mentionedEverywhere(), site: null }));
    expect(none.criticalFailures.find((f) => f.key === "no_website")!.pointsLost).toBe(38);
    expect(find(none, "fact_accuracy").pointsLost).toBe(0);
  });
});

describe("competitor extraction", () => {
  it("does not score a win when no classifier extracted competitors", () => {
    const out = computeScore(input({ runs: runs(() => ({ mentioned: true, mentionPosition: null, sentiment: null, accuracy: null, citations: [cite(2)] })), competitors: [] }));
    expect(find(out, "share_of_voice").value).toBeNull();
    expect(find(out, "rank_vs_competitors").value).toBeNull();
    expect(find(out, "share_of_voice").finding).toContain("Competitor extraction was unavailable");
    const pillar = out.pillars.find((p) => p.key === "competitive_position")!;
    expect(pillar.score).toBe(0);
    expect(pillar.confidence).toBe("low");
    expect(out.criticalFailures.some((f) => f.key === "outranked")).toBe(false);
  });

  it("scores a measured win when the classifier ran and named nobody else", () => {
    const out = computeScore(input({ runs: runs(() => ({ mentioned: true, mentionPosition: 1, classifierUsed: true, citations: [cite(2)] })), competitors: [] }));
    expect(find(out, "share_of_voice").value).toBe(1);
    expect(find(out, "share_of_voice").finding).toBe("No competitor was named alongside you.");
    expect(find(out, "rank_vs_competitors").finding).toContain("Ranked #1 of 1");
  });

  it("infers a classifier pass from sentiment or accuracy when the flag is absent", () => {
    const out = computeScore(input({ runs: runs(() => ({ mentioned: true, mentionPosition: 1, sentiment: "positive", accuracy: "accurate", citations: [cite(2)] })), competitors: [] }));
    expect(find(out, "share_of_voice").value).toBe(1);
    expect(out.pillars.find((p) => p.key === "competitive_position")!.confidence).toBe("high");
  });

  it("keeps never-mentioned as a measured zero without competitor extraction", () => {
    const out = computeScore(input({ runs: runs(() => ({ mentioned: false, citations: [cite(3)] })), competitors: [] }));
    expect(find(out, "share_of_voice").value).toBe(0);
    expect(find(out, "rank_vs_competitors").value).toBe(0);
    expect(find(out, "rank_vs_competitors").finding).toBe("Unranked: engines never named you.");
  });
});

describe("invisible failure wording", () => {
  it("only claims a by-name miss when a direct brand prompt completed", () => {
    const noBrand = computeScore(input({ runs: runs((_engine, promptIndex) => (promptIndex >= 4 ? { status: "skipped" } : { mentioned: false, citations: [cite(3)] })) }));
    expect(noBrand.criticalFailures.find((f) => f.key === "invisible")!.detail).not.toContain("by name");
    expect(find(noBrand, "brand_recognition").finding).toBe("No direct brand prompts were completed.");
    const withBrand = computeScore(input({ runs: runs(() => ({ mentioned: false, citations: [cite(3)] })) }));
    expect(withBrand.criticalFailures.find((f) => f.key === "invisible")!.detail).toContain("not even when asked about you by name");
  });
});

describe("unknown site checks", () => {
  it("leaves an unfetched sitemap and llms.txt unmeasured instead of absent", () => {
    const out = computeScore(input({ runs: mentionedEverywhere(), site: site({ sitemapFound: null, sitemapUrl: null, llmsTxtFound: null, unknown: ["sitemap", "llms"] }) }));
    expect(find(out, "sitemap").value).toBeNull();
    expect(find(out, "sitemap").finding).toBe("The sitemap could not be fetched.");
    expect(find(out, "sitemap").confidence).toBe("low");
    expect(find(out, "llms_txt").value).toBeNull();
    expect(find(out, "llms_txt").finding).toBe("llms.txt could not be fetched.");
    expect(out.roadmap.some((r) => r.key === "sitemap" || r.key === "llms_txt")).toBe(false);
  });

  it("still scores a confirmed absence as zero", () => {
    const out = computeScore(input({ runs: mentionedEverywhere(), site: site({ sitemapFound: false, sitemapUrl: null, llmsTxtFound: false }) }));
    expect(find(out, "sitemap").value).toBe(0);
    expect(find(out, "sitemap").finding).toBe("No XML sitemap found.");
    expect(find(out, "llms_txt").finding).toBe("No llms.txt file.");
  });
});

describe("roadmap", () => {
  it("excludes metrics that could not be measured", () => {
    const zero = computeScore(input({ runs: runs(() => ({ mentioned: false, citations: [cite(3)] })), competitors: [{ id: "k1", name: "Summit Dental", runCount: 40, mentionCount: 44 }] }));
    expect(find(zero, "fact_accuracy").value).toBeNull();
    expect(zero.roadmap.some((r) => r.key === "fact_accuracy")).toBe(false);
    const unfetched = computeScore(input({ runs: mentionedEverywhere(), site: site({ robots: null, robotsFound: null, unknown: ["robots"] }) }));
    expect(find(unfetched, "crawler_access").value).toBeNull();
    expect(unfetched.roadmap.some((r) => r.key === "crawler_access")).toBe(false);
    for (const item of [...zero.roadmap, ...unfetched.roadmap]) expect(item.pointsRecoverable).toBeGreaterThan(0);
  });
});
