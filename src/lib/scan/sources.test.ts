import { describe, expect, it } from "vitest";
import { classifySource } from "./sources";

describe("classifySource", () => {
  it("treats the business's own domain and subdomains as tier 1", () => {
    expect(classifySource("https://www.rsmkarate.com/about", "rsmkarate.com")).toMatchObject({ tier: 1, isBusinessOwned: true });
    expect(classifySource("https://blog.rsmkarate.com/post", "rsmkarate.com").tier).toBe(1);
    expect(classifySource("https://notrsmkarate.com/", "rsmkarate.com").tier).not.toBe(1);
  });

  it("recognises authoritative third parties", () => {
    expect(classifySource("https://www.nytimes.com/2026/01/01/x.html", null).tier).toBe(2);
    expect(classifySource("https://en.wikipedia.org/wiki/Karate", null).tier).toBe(2);
    expect(classifySource("https://www.rsm.gov/business", null).tier).toBe(2);
    expect(classifySource("https://www.google.com/maps/place/x", null).tier).toBe(2);
  });

  it("puts review platforms and unknown sites in tier 3", () => {
    expect(classifySource("https://www.yelp.com/biz/rsm-karate", null)).toMatchObject({ tier: 3 });
    expect(classifySource("https://www.some-random-local-site.com/page", null)).toMatchObject({ tier: 3, reason: "General third-party website" });
  });

  it("puts user-generated and forum content in tier 4", () => {
    expect(classifySource("https://www.reddit.com/r/orangecounty/comments/x", null).tier).toBe(4);
    expect(classifySource("https://x.com/someone/status/1", null).tier).toBe(4);
    expect(classifySource("https://example-club.org/forums/thread/12", null).tier).toBe(4);
  });

  it("never marks a third party as business-owned and handles bad URLs", () => {
    expect(classifySource("https://www.yelp.com/biz/x", "rsmkarate.com").isBusinessOwned).toBe(false);
    expect(classifySource("not a url", null)).toMatchObject({ tier: 3, isBusinessOwned: false });
  });
});
