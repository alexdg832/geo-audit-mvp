import { describe, expect, it } from "vitest";
import { distinctSources, groupCitationsByUrl, pdfSafe, pdfText, safeHref, type CitationView, type RunView } from "./format";

function citation(over: Partial<CitationView> & { id: string; url: string }): CitationView {
  return {
    index: 0,
    domain: new URL(over.url).hostname.replace(/^www\./, ""),
    title: null,
    tier: 3,
    tierReason: null,
    isBusinessOwned: false,
    passageStart: null,
    passageEnd: null,
    passageText: null,
    citedText: null,
    ...over,
  };
}

function run(over: Partial<RunView> & { id: string }): RunView {
  return {
    engine: "perplexity",
    engineLabel: "Perplexity",
    model: null,
    promptId: "p1",
    promptIndex: 0,
    promptKind: "recommendation",
    promptText: "Best karate school?",
    runIndex: 0,
    status: "complete",
    answerText: "",
    latencyMs: null,
    cached: false,
    noCitations: false,
    error: null,
    mentioned: false,
    mentionPosition: null,
    mentionStart: null,
    mentionEnd: null,
    sentiment: null,
    accuracy: null,
    accuracyNotes: null,
    competitors: [],
    completedAt: null,
    citations: [],
    ...over,
  };
}

describe("safeHref", () => {
  it("accepts http(s) and rejects everything else", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });
});

describe("groupCitationsByUrl", () => {
  it("lists a URL cited from several sentences once and keeps every passage", () => {
    const yelp = "https://www.yelp.com/biz/foo";
    const groups = groupCitationsByUrl([
      citation({ id: "a", url: yelp, index: 0, passageStart: 0, passageEnd: 10, passageText: "Opens at 9" }),
      citation({ id: "b", url: yelp, index: 1, passageStart: 11, passageEnd: 20, passageText: "Reviews", title: "Foo - Yelp" }),
      citation({ id: "c", url: "https://foo.com/", index: 2, tier: 1, isBusinessOwned: true }),
      citation({ id: "d", url: yelp, index: 3, passageStart: 21, passageEnd: 30 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ index: 0, url: yelp, title: "Foo - Yelp", tier: 3 });
    expect(groups[0].citations.map((c) => c.id)).toEqual(["a", "b", "d"]);
    expect(groups[1]).toMatchObject({ index: 1, url: "https://foo.com/", tier: 1, isBusinessOwned: true });
  });

  it("returns nothing for an answer without citations", () => {
    expect(groupCitationsByUrl([])).toEqual([]);
  });
});

describe("distinctSources", () => {
  it("counts a URL once across answers and flags it when any mentioning answer cites it", () => {
    const yelp = "https://www.yelp.com/biz/foo";
    const sources = distinctSources([
      run({ id: "r1", mentioned: false, citations: [citation({ id: "a", url: yelp }), citation({ id: "b", url: yelp })] }),
      run({ id: "r2", engine: "openai", engineLabel: "ChatGPT", mentioned: true, citations: [citation({ id: "c", url: yelp, title: "Foo - Yelp" }), citation({ id: "d", url: "https://reddit.com/r/x", tier: 4 })] }),
    ]);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ url: yelp, mentioned: true, rowCount: 3, engines: ["Perplexity", "ChatGPT"], title: "Foo - Yelp" });
    expect(sources[1]).toMatchObject({ url: "https://reddit.com/r/x", mentioned: true, rowCount: 1, tier: 4 });
    expect(sources.filter((s) => s.mentioned && s.tier === 4)).toHaveLength(1);
  });
});

describe("pdfText", () => {
  it("keeps the WinAnsi punctuation the template relies on", () => {
    const text = "— – … • “quoted” ‘single’ · × ° € ™ café";
    expect(pdfText(text)).toBe(text);
  });

  it("replaces the minus sign and common symbols with ASCII", () => {
    expect(pdfText("(−5 pts) → ✓ done ≥ 3 ★")).toBe("(-5 pts) -> [ok] done >= 3 *");
  });

  it("drops emoji and leaves one marker per run of another script", () => {
    expect(pdfText("✨ Best 東京 ramen ✨")).toBe(" Best ? ramen ");
    expect(pdfText("👍 great")).toBe(" great");
  });

  it("keeps the base letter of accented characters Helvetica lacks", () => {
    expect(pdfText("Győr Łódź")).toBe("Gyor ?ódz");
    expect(pdfText("é")).toBe("é");
  });

  it("preserves line breaks and handles empty input", () => {
    expect(pdfText("a\nb")).toBe("a\nb");
    expect(pdfText(null)).toBe("");
    expect(pdfText("")).toBe("");
  });
});

describe("pdfSafe", () => {
  it("sanitises every string in a nested value and leaves other types alone", () => {
    expect(pdfSafe({ score: 42, ok: true, nothing: null, title: "A → B", items: ["✓ one", { deep: "−2" }] })).toEqual({
      score: 42,
      ok: true,
      nothing: null,
      title: "A -> B",
      items: ["[ok] one", { deep: "-2" }],
    });
  });
});
