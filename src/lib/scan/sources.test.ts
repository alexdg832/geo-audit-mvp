import { describe, expect, it } from "vitest";
import { classifySource, isKnownPlatformDomain } from "./sources";

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

  it("treats only Google Maps, Search and Business Profile hosts as authoritative", () => {
    expect(classifySource("https://www.google.com/maps/place/x", null)).toMatchObject({ tier: 2, reason: "Authoritative third party (google.com/maps)" });
    expect(classifySource("https://www.google.com/search?q=rsm+karate", null).tier).toBe(2);
    expect(classifySource("https://maps.google.com/?cid=1", null)).toMatchObject({ tier: 2, reason: "Authoritative third party (maps.google.com)" });
    expect(classifySource("https://business.google.com/n/123", null).tier).toBe(2);
    // Other apex paths are ordinary pages, not listings.
    expect(classifySource("https://www.google.com/business/answer/123", null)).toMatchObject({ tier: 3, reason: "General third-party website" });
  });

  it("puts user-published Google hosts in tier 4", () => {
    expect(classifySource("https://docs.google.com/document/d/1abc/edit", null).tier).toBe(4);
    expect(classifySource("https://drive.google.com/file/d/1abc/view", null).tier).toBe(4);
    expect(classifySource("https://groups.google.com/g/some-forum/c/thread1", null).tier).toBe(4);
    expect(classifySource("https://sites.google.com/view/some-biz", null).tier).toBe(4);
    // Community threads on the support host fall to the forum-path rule.
    expect(classifySource("https://support.google.com/business/thread/123/x", null).tier).toBe(4);
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

describe("isKnownPlatformDomain", () => {
  it("recognises social, directory, review and Google hosts including subdomains", () => {
    for (const d of ["facebook.com", "www.facebook.com", "m.facebook.com", "yelp.com", "linktr.ee", "google.com", "sites.google.com", "nytimes.com", "wixsite.com"]) {
      expect(isKnownPlatformDomain(d), d).toBe(true);
    }
  });

  it("treats a customer subdomain on a free host as the business's own site", () => {
    expect(isKnownPlatformDomain("mybiz.wixsite.com")).toBe(false);
    expect(isKnownPlatformDomain("mybiz.myshopify.com")).toBe(false);
    expect(isKnownPlatformDomain("mybiz.wordpress.com")).toBe(false);
  });

  it("is false for ordinary domains", () => {
    expect(isKnownPlatformDomain("rsmkarate.com")).toBe(false);
    expect(isKnownPlatformDomain("notfacebook.com")).toBe(false);
    expect(isKnownPlatformDomain("")).toBe(false);
  });
});
