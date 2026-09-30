import { describe, expect, it } from "vitest";
import { extractText, searchErrorCodes, type MessagesOutput } from "./anthropic";

describe("anthropic response parsing", () => {
  it("attaches web_search_result_location citations to the text block they support", () => {
    const raw: MessagesOutput = {
      content: [
        { type: "text", text: "Based on the search results, " },
        { type: "server_tool_use", text: undefined },
        {
          type: "text",
          text: "Acme opens at 9am.",
          citations: [{ type: "web_search_result_location", url: "https://acme.example/hours", title: "Hours", cited_text: "We open at 9am" }],
        },
      ],
    };
    const { text, citations } = extractText(raw);
    expect(text).toBe("Based on the search results, Acme opens at 9am.");
    expect(citations).toEqual([{ url: "https://acme.example/hours", title: "Hours", start: 29, end: 47, citedText: "We open at 9am" }]);
  });

  it("surfaces the error code the API hides inside a 200 response", () => {
    const raw: MessagesOutput = {
      content: [
        { type: "server_tool_use" },
        { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } },
        { type: "text", text: "I could not search right now." },
      ],
    };
    expect(searchErrorCodes(raw)).toEqual(["too_many_requests"]);
  });

  it("treats a list of results as a successful search", () => {
    const raw: MessagesOutput = {
      content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.example", title: "A" }] }],
    };
    expect(searchErrorCodes(raw)).toEqual([]);
  });
});
