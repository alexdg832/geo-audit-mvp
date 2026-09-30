import { describe, expect, it } from "vitest";
import { parseAgentOutput, spansForMarkers, type AgentOutput } from "./perplexity";

const RESULTS = [
  { id: 1, url: "https://example.com/a", title: "A", snippet: "about a" },
  { id: 2, url: "https://example.com/b", title: "B", snippet: "about b" },
  { id: 3, url: "https://example.com/c", title: "C", snippet: "about c" },
];

function response(text: string, annotations: NonNullable<NonNullable<AgentOutput["output"]>[number]["content"]>[number]["annotations"] = []): AgentOutput {
  return {
    model: "openai/gpt-6-luna",
    output: [
      { type: "search_results", queries: ["q"], results: RESULTS },
      { type: "message", content: [{ type: "output_text", text, annotations }] },
    ],
  };
}

describe("parseAgentOutput", () => {
  it("prefers url_citation annotations and keeps their character spans", () => {
    const { text, citations } = parseAgentOutput(response("Spain won.", [{ type: "url_citation", url: "https://example.com/z", title: "Z", start_index: 0, end_index: 10 }]));
    expect(text).toBe("Spain won.");
    expect(citations).toEqual([{ url: "https://example.com/z", title: "Z", start: 0, end: 10, citedText: null }]);
  });

  it("resolves [n] and [web:n] markers against search result ids and only counts cited results", () => {
    const { citations } = parseAgentOutput(response("First point [1]. Second point [web:3]. Unrelated."));
    expect(citations.map((c) => c.url)).toEqual(["https://example.com/a", "https://example.com/c"]);
    expect(citations[0]).toMatchObject({ start: 0, end: 15, citedText: "about a" });
    expect(citations[1]).toMatchObject({ start: 17, end: 37 });
  });

  it("falls back to every search result, without spans, when the answer carries no markers", () => {
    const { citations } = parseAgentOutput(response("No markers here."));
    expect(citations).toHaveLength(3);
    expect(citations.every((c) => c.start === null && c.end === null)).toBe(true);
  });

  it("concatenates several output_text parts and offsets annotation spans by the preceding text", () => {
    const raw: AgentOutput = {
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "Part one. ", annotations: [] },
            { type: "output_text", text: "Part two.", annotations: [{ type: "url_citation", url: "https://example.com/t", start_index: 0, end_index: 9 }] },
          ],
        },
      ],
    };
    const { text, citations } = parseAgentOutput(raw);
    expect(text).toBe("Part one. Part two.");
    expect(citations[0]).toMatchObject({ start: 10, end: 19 });
  });
});

describe("spansForMarkers", () => {
  it("maps each marker to the sentence before it", () => {
    const spans = spansForMarkers("Alpha beta [2]. Gamma [2] delta.\nEpsilon [10].");
    expect(spans.get(2)).toEqual([
      { start: 0, end: 14 },
      { start: 16, end: 25 },
    ]);
    expect(spans.get(10)).toEqual([{ start: 33, end: 45 }]);
  });
});
