import { describe, expect, it } from "vitest";
import { inferCategoryFromText, resolveBusiness, resolveOwnDomain } from "./resolveBusiness";
import type { SiteScanResult } from "./siteScan";

function site(overrides: Partial<SiteScanResult>): SiteScanResult {
  return {
    url: "https://mybiz.com/",
    fetchOk: true,
    fetchError: null,
    httpStatus: 200,
    finalUrl: "https://mybiz.com/",
    https: true,
    responseMs: 100,
    htmlBytes: 1000,
    title: null,
    metaDescription: null,
    h1: null,
    wordCount: 100,
    textRatio: 0.2,
    jsRequired: false,
    metaRobots: null,
    schemaTypes: [],
    schemaHasNap: null,
    hasAboutPage: null,
    hasContactInfo: null,
    detectedPhone: null,
    detectedAddress: null,
    hasHours: null,
    hasFaq: null,
    lastModified: null,
    robotsFound: null,
    robots: null,
    robotsDedicated: [],
    llmsTxtFound: null,
    sitemapFound: null,
    sitemapUrl: null,
    robotsSitemaps: [],
    categoryHint: null,
    unknown: [],
    ...overrides,
  };
}

describe("inferCategoryFromText", () => {
  it("anchors prefixes so partial words do not match", () => {
    expect(inferCategoryFromText("Skyline Rooftop Bar & Grill")).toBe("restaurant");
    expect(inferCategoryFromText("Summit Roofing Co")).toBe("roofing contractor");
    expect(inferCategoryFromText("Bob's Roof Repair")).toBe("roofing contractor");
    expect(inferCategoryFromText("Book Now | Smith Wellness")).toBeNull();
    expect(inferCategoryFromText("Skylight Books")).toBe("bookstore");
  });

  it("prefers specific compounds over the bare words they contain", () => {
    expect(inferCategoryFromText("ABC Auto Insurance")).toBe("insurance agency");
    expect(inferCategoryFromText("Bob's Auto Sales")).toBe("car dealership");
    expect(inferCategoryFromText("Joe's Auto Repair")).toBe("auto repair shop");
    expect(inferCategoryFromText("Joe's Auto")).toBe("auto repair shop");
    expect(inferCategoryFromText("Coastal Kitchen & Bath Remodeling")).toBe("remodeling contractor");
    expect(inferCategoryFromText("Mama's Kitchen")).toBe("restaurant");
    expect(inferCategoryFromText("Sparkle Dry Cleaners")).toBe("dry cleaner");
  });

  it("drops fraternal and place-name collisions", () => {
    expect(inferCategoryFromText("Elks Lodge")).toBeNull();
    expect(inferCategoryFromText("Garden Grove Smiles")).toBeNull();
    expect(inferCategoryFromText("Green Thumb Landscaping")).toBe("landscaping company");
    expect(inferCategoryFromText("Sprouts Farmers Market")).toBe("grocery store");
  });

  it("keeps the common categories working", () => {
    expect(inferCategoryFromText("RSM Karate")).toBe("martial arts school");
    expect(inferCategoryFromText("Riverside Family Dental")).toBe("dentist");
    expect(inferCategoryFromText("Acme Plumbing")).toBe("plumber");
    expect(inferCategoryFromText("Mission Viejo Optometry")).toBe("optometrist");
    expect(inferCategoryFromText("Harbor View Inn")).toBe("hotel");
    expect(inferCategoryFromText("Studio 5 Dance")).toBe("dance studio");
  });
});

describe("resolveOwnDomain", () => {
  it("keeps the typed domain when the site redirects to a platform", () => {
    expect(resolveOwnDomain("mybiz.com", "facebook.com")).toEqual({ domain: "mybiz.com", redirectDomain: "facebook.com" });
    expect(resolveOwnDomain("mybiz.com", "linktr.ee")).toEqual({ domain: "mybiz.com", redirectDomain: "linktr.ee" });
  });

  it("adopts the live domain when the site migrated to another ordinary domain, recording the hop", () => {
    expect(resolveOwnDomain("mybiz.com", "mybiz.net")).toEqual({ domain: "mybiz.net", redirectDomain: "mybiz.net" });
  });

  it("follows www and subdomain hops within the same site", () => {
    expect(resolveOwnDomain("mybiz.com", "mybiz.com")).toEqual({ domain: "mybiz.com", redirectDomain: null });
    expect(resolveOwnDomain("mybiz.com", "shop.mybiz.com")).toEqual({ domain: "mybiz.com", redirectDomain: null });
    expect(resolveOwnDomain("shop.mybiz.com", "mybiz.com")).toEqual({ domain: "mybiz.com", redirectDomain: null });
  });

  it("never treats a shared platform as the owned domain", () => {
    expect(resolveOwnDomain("facebook.com", "facebook.com")).toEqual({ domain: null, redirectDomain: null });
    expect(resolveOwnDomain("sites.google.com", null)).toEqual({ domain: null, redirectDomain: null });
    expect(resolveOwnDomain("mybiz.wixsite.com", "mybiz.wixsite.com")).toEqual({ domain: "mybiz.wixsite.com", redirectDomain: null });
  });

  it("handles a missing website or fetch", () => {
    expect(resolveOwnDomain(null, null)).toEqual({ domain: null, redirectDomain: null });
    expect(resolveOwnDomain("mybiz.com", null)).toEqual({ domain: "mybiz.com", redirectDomain: null });
  });
});

describe("resolveBusiness", () => {
  it("does not adopt an off-site redirect target as the business domain", () => {
    const resolved = resolveBusiness(
      { name: "Mission Viejo Karate", website: "mvkarate.example", location: "Mission Viejo, CA" },
      site({ finalUrl: "https://www.facebook.com/mvkarate" })
    );
    expect(resolved.domain).toBe("mvkarate.example");
    expect(resolved.redirectDomain).toBe("facebook.com");
    expect(resolved.website).toBe("https://mvkarate.example/");
  });

  it("keeps the typed domain when the fetch failed mid-redirect", () => {
    const resolved = resolveBusiness(
      { name: "Acme", website: "https://acme.example", location: null },
      site({ fetchOk: false, httpStatus: null, finalUrl: "https://www.facebook.com/acme", fetchError: "HTTP 403" })
    );
    expect(resolved.domain).toBe("acme.example");
    expect(resolved.redirectDomain).toBe("facebook.com");
  });

  it("uses the name first, then schema, then title and h1 but not the meta description", () => {
    expect(resolveBusiness({ name: "ABC Auto Insurance", website: null, location: null }, site({ categoryHint: "auto repair shop" })).category).toBe("insurance agency");
    expect(resolveBusiness({ name: "Smith Wellness", website: null, location: null }, site({ categoryHint: "medical clinic" }))).toMatchObject({ category: "medical clinic", categorySource: "schema" });
    expect(resolveBusiness({ name: "Smith Wellness", website: null, location: null }, site({ title: "Book Now | Smith Wellness", h1: "Family Dentist in Mission Viejo" }))).toMatchObject({ category: "dentist", categorySource: "keywords" });
    expect(resolveBusiness({ name: "Smith Wellness", website: null, location: null }, site({ metaDescription: "Book your pet's visit today" }))).toMatchObject({ category: null, categorySource: "none" });
  });
});
