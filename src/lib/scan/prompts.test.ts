import { describe, expect, it } from "vitest";
import { generatePrompts } from "./prompts";

describe("generatePrompts", () => {
  it("produces the fixed set of six prompts across four kinds", () => {
    const prompts = generatePrompts({ name: "RSM Karate", category: "martial arts school", location: "Rancho Santa Margarita, CA" });
    expect(prompts).toHaveLength(6);
    expect(prompts.map((p) => p.kind)).toEqual(["recommendation", "recommendation", "near_me", "comparison", "brand_direct", "brand_direct"]);
    expect(prompts.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(prompts[0].text).toContain("martial arts schools in Rancho Santa Margarita, CA");
    expect(prompts[4].text).toContain("RSM Karate in Rancho Santa Margarita, CA");
  });

  it("is deterministic for the same input", () => {
    const a = generatePrompts({ name: "Acme Plumbing", category: "plumber", location: "Austin, TX" });
    const b = generatePrompts({ name: "Acme Plumbing", category: "plumber", location: "Austin, TX" });
    expect(a).toEqual(b);
  });

  it("falls back sensibly without a category or location", () => {
    const prompts = generatePrompts({ name: "Acme", category: null, location: null });
    expect(prompts[0].text).toContain("best businesses?");
    expect(prompts[2].text).toContain("near me");
    expect(prompts[4].text).not.toContain(" in ");
  });

  it("pluralises categories", () => {
    expect(generatePrompts({ name: "X", category: "day spa", location: null })[0].text).toContain("day spas");
    expect(generatePrompts({ name: "X", category: "bakery", location: null })[0].text).toContain("bakeries");
    expect(generatePrompts({ name: "X", category: "auto repair shop", location: null })[0].text).toContain("auto repair shops");
  });
});
