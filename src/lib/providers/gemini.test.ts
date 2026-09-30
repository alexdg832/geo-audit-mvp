import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "./gemini";

// The em dash is three UTF-8 bytes, so byte and character offsets diverge before the claim starts.
const INTRO = "Intro — sentence. ";
const CLAIM = "Acme Karate is the top-rated dojo in Mission Viejo.";
const CHUNK_URL = "https://example.test/acme";

function geminiResponse(parts: { text: string }[], groundingSupports: unknown[]): Response {
  const body = {
    candidates: [
      {
        content: { parts },
        groundingMetadata: { groundingChunks: [{ web: { uri: CHUNK_URL, title: "Acme" } }], groundingSupports },
      },
    ],
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function stubFetch(response: Response) {
  const fetchImpl = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gemini grounding spans", () => {
  it("anchors byte offsets inside the part named by partIndex, not the joined answer", async () => {
    const fetchImpl = stubFetch(
      geminiResponse(
        [{ text: INTRO }, { text: CLAIM }],
        [{ segment: { partIndex: 1, startIndex: 0, endIndex: Buffer.byteLength(CLAIM, "utf8"), text: CLAIM }, groundingChunkIndices: [0] }]
      )
    );

    const result = await createGeminiProvider("test-not-a-real-key").query("best dojo in mission viejo");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.answerText).toBe(INTRO + CLAIM);
    expect(result.citations).toHaveLength(1);
    const [citation] = result.citations;
    expect(citation.url).toBe(CHUNK_URL);
    expect(citation.start).toBe(INTRO.length);
    expect(citation.end).toBe(INTRO.length + CLAIM.length);
    expect(result.answerText.slice(citation.start ?? 0, citation.end ?? 0)).toBe(CLAIM);
  });

  it("drops the span but keeps the citation when segment.text does not match the addressed slice", async () => {
    // Offsets that would be correct for the joined answer point at different text inside part 1.
    const joinedStart = Buffer.byteLength(INTRO, "utf8");
    stubFetch(
      geminiResponse(
        [{ text: INTRO }, { text: CLAIM }],
        [
          {
            segment: { partIndex: 1, startIndex: joinedStart, endIndex: joinedStart + Buffer.byteLength(CLAIM, "utf8"), text: CLAIM },
            groundingChunkIndices: [0],
          },
        ]
      )
    );

    const result = await createGeminiProvider("test-not-a-real-key").query("best dojo in mission viejo");

    expect(result.citations).toEqual([{ url: CHUNK_URL, title: "Acme", start: null, end: null, citedText: CLAIM }]);
  });

  it("drops the span when partIndex names a part that does not exist", async () => {
    stubFetch(
      geminiResponse([{ text: CLAIM }], [{ segment: { partIndex: 3, startIndex: 0, endIndex: 10, text: CLAIM.slice(0, 10) }, groundingChunkIndices: [0] }])
    );

    const result = await createGeminiProvider("test-not-a-real-key").query("best dojo in mission viejo");

    expect(result.citations).toEqual([{ url: CHUNK_URL, title: "Acme", start: null, end: null, citedText: CLAIM.slice(0, 10) }]);
  });

  it("treats an omitted partIndex and startIndex as zero and converts UTF-8 bytes to character indices", async () => {
    const sentence = "Café Karate leads the rankings.";
    const answer = `${sentence} Then more text.`;
    stubFetch(geminiResponse([{ text: answer }], [{ segment: { endIndex: Buffer.byteLength(sentence, "utf8"), text: sentence }, groundingChunkIndices: [0] }]));

    const result = await createGeminiProvider("test-not-a-real-key").query("best dojo in mission viejo");

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({ url: CHUNK_URL, start: 0, end: sentence.length });
    expect(result.answerText.slice(0, sentence.length)).toBe(sentence);
  });
});
