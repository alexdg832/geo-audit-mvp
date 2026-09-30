import { describe, expect, it } from "vitest";
import { ProviderError, providerHttpError, publicErrorMessage } from "./types";

describe("publicErrorMessage", () => {
  it("never repeats the provider's response body", () => {
    const err = providerHttpError("openai", 401, "Incorrect API key provided: sk-proj-abcd…WXYZ. You can find your API key at platform.openai.com");
    expect(err.message).toContain("sk-proj");
    const safe = publicErrorMessage(err);
    expect(safe).toBe("ChatGPT rejected the API key (HTTP 401)");
    expect(safe).not.toMatch(/sk-proj|platform\.openai/);
  });

  it("maps the status classes to fixed customer-facing text", () => {
    expect(publicErrorMessage(providerHttpError("perplexity", 402, "insufficient credits"))).toBe("Perplexity reported a billing or quota problem (HTTP 402)");
    expect(publicErrorMessage(providerHttpError("anthropic", 404, "model: claude-x not found"))).toBe("Claude could not find the requested model or endpoint (HTTP 404)");
    expect(publicErrorMessage(providerHttpError("openai", 429, "Rate limit reached for org-XXXXXXXX"))).toBe("ChatGPT rate-limited the request (HTTP 429)");
    expect(publicErrorMessage(providerHttpError("gemini", 503, "<html>overloaded</html>"))).toBe("Gemini had a server error (HTTP 503)");
    expect(publicErrorMessage(providerHttpError("gemini", 418, "teapot"))).toBe("Gemini returned HTTP 418");
    expect(publicErrorMessage(new ProviderError("openai", "OpenAI returned no text output"))).toBe("ChatGPT returned an unusable answer");
  });

  it("hides infrastructure detail from non-provider errors", () => {
    expect(publicErrorMessage(new Error("Timed out after 60000 ms"))).toBe("The request timed out");
    expect(publicErrorMessage(new TypeError("fetch failed"))).toBe("Network error while contacting the engine");
    const db = publicErrorMessage(new Error("Invalid `prisma.engineRun.update()` invocation: Can't reach database server at `ep-xxxx.us-east-2.aws.neon.tech:5432`"));
    expect(db).toBe("Unexpected error while running this check");
    expect(publicErrorMessage("boom")).toBe("Unexpected error while running this check");
  });
});
