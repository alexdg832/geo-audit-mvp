import { inflateSync } from "node:zlib";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import type { ReportData } from "./format";
import { ReportPdf } from "./pdf";

const yelp = "https://www.yelp.com/biz/foo";
const data: ReportData = {
  audit: {
    id: "a1",
    businessId: "b1",
    businessName: "Foo Karate → Dojo ✓",
    website: "https://foo.com",
    domain: "foo.com",
    location: "Mission Viejo, CA",
    category: "Karate school",
    ambiguity: null,
    createdAt: "2026-09-29T00:00:00.000Z",
    completedAt: "2026-09-29T00:10:00.000Z",
    isMock: true,
    scanVersion: "1",
    scoringVersion: "1",
    status: "complete",
    runsPerPrompt: 2,
  },
  report: {
    score: 42,
    grade: "D",
    confidence: "medium",
    verdict: "Mostly invisible ✅ 東京",
    pillars: [{ key: "ai_visibility", label: "AI Visibility", weight: 30, score: 10, confidence: "medium" }],
    caps: [],
    criticalFailures: [{ key: "no_schema", title: "No schema", detail: "Add JSON-LD", pointsLost: 5 } as never],
    roadmap: [],
    costOfInaction: null,
    generatedAt: "2026-09-29T00:10:00.000Z",
  },
  breakdowns: [],
  engines: [{ engine: "perplexity", label: "Perplexity", status: "live", model: "sonar", callsMade: 2, error: null }],
  prompts: [{ id: "p1", index: 0, kind: "recommendation", text: "Best karate school in Mission Viejo?" }],
  runs: [
    {
      id: "r1",
      engine: "perplexity",
      engineLabel: "Perplexity",
      model: "sonar",
      promptId: "p1",
      promptIndex: 0,
      promptKind: "recommendation",
      promptText: "Best karate school in Mission Viejo?",
      runIndex: 0,
      status: "complete",
      answerText: "Foo opens at 9[1]. Reviews are strong[1]. Prices are fair[1].",
      latencyMs: 1200,
      cached: false,
      noCitations: false,
      error: null,
      mentioned: true,
      mentionPosition: 1,
      mentionStart: 0,
      mentionEnd: 3,
      sentiment: "positive",
      accuracy: "accurate",
      accuracyNotes: null,
      competitors: [],
      completedAt: "2026-09-29T00:05:00.000Z",
      citations: [
        { id: "c1", index: 0, url: yelp, domain: "yelp.com", title: "Foo - Yelp", tier: 3, tierReason: null, isBusinessOwned: false, passageStart: 0, passageEnd: 18, passageText: "Foo opens at 9[1].", citedText: null },
        { id: "c2", index: 1, url: yelp, domain: "yelp.com", title: "Foo - Yelp", tier: 3, tierReason: null, isBusinessOwned: false, passageStart: 19, passageEnd: 41, passageText: "Reviews are strong[1].", citedText: null },
        { id: "c3", index: 2, url: yelp, domain: "yelp.com", title: "Foo - Yelp", tier: 3, tierReason: null, isBusinessOwned: false, passageStart: 42, passageEnd: 62, passageText: "Prices are fair[1].", citedText: null },
      ],
    },
  ],
  competitors: [],
  site: null,
  hasAccount: false,
};

describe("ReportPdf smoke", () => {
  it("renders with grouped citations and WinAnsi-safe text", async () => {
    const buffer = await renderToBuffer(ReportPdf({ data, unlocked: true }));
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    // Inflate every content stream and check the sanitised strings made it in and the raw minus did not.
    const raw = buffer.toString("latin1");
    const streams: string[] = [];
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    for (const m of raw.matchAll(re)) {
      try {
        streams.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
      } catch {
        /* not a deflated stream */
      }
    }
    // Text is written as hex glyph strings inside TJ arrays; with WinAnsi each byte is one character.
    const text = streams
      .join("\n")
      .split("\n")
      .map((line) => Array.from(line.matchAll(/<([0-9a-fA-F]+)>/g), (m) => Buffer.from(m[1], "hex").toString("latin1")).join(""))
      .filter(Boolean)
      .join("");
    // Each JSX expression child becomes its own run, so assert on the concatenated stream text.
    expect(text).toContain("(-5 pts)");
    expect(text).toContain("-> Dojo [ok]");
    expect(text).toContain("(+2 more passages)");
    expect(text).toContain("sources traced: 1");
    expect(text).not.toContain("\x12");
  });
});
