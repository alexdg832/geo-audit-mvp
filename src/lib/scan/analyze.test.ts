import { describe, expect, it } from "vitest";
import {
  analyzeDeterministic,
  buildMentionRegex,
  findMentions,
  mergeAnalysis,
  normalizeBusinessName,
  parseClassifierOutput,
} from "./analyze";

describe("normalizeBusinessName", () => {
  it("strips legal suffixes and punctuation", () => {
    expect(normalizeBusinessName("Riverside Family Dental, LLC")).toBe("riverside family dental");
    expect(normalizeBusinessName("Smith & Sons Plumbing Inc.")).toBe("smith sons plumbing");
  });
});

describe("findMentions", () => {
  it("matches the full name and tolerant variants", () => {
    const answer = "Top picks: 1. Riverside Family Dental is great. 2. Riverside Dental also gets praise. 3. Downtown Smiles.";
    const mentions = findMentions(answer, "Riverside Family Dental", null);
    expect(mentions.map((m) => m.text)).toEqual(["Riverside Family Dental", "Riverside Dental"]);
  });

  it("does not match inside other words", () => {
    expect(findMentions("Kidney stones are painful; kids agree.", "Kid", null)).toHaveLength(0);
    expect(findMentions("visit rsmkarate.com today", "RSM Karate", "rsmkarate.com").map((m) => m.text)).toEqual(["rsmkarate.com"]);
  });

  it("handles possessives and punctuation between tokens", () => {
    expect(findMentions("I love Riverside-Family Dental's hygienists.", "Riverside Family Dental", null)).toHaveLength(1);
  });

  it("requires every significant token", () => {
    expect(findMentions("Riverside is a nice neighbourhood.", "Riverside Family Dental", null)).toHaveLength(0);
    expect(buildMentionRegex("   ")).toBeNull();
  });
});

describe("analyzeDeterministic", () => {
  it("reports list rank for the first mention", () => {
    const answer = "Here are options:\n1. Alpha Dental\n2. Riverside Family Dental\n3. Gamma Smiles\nAll are good.";
    const a = analyzeDeterministic(answer, "Riverside Family Dental", null);
    expect(a.mentioned).toBe(true);
    expect(a.listRank).toBe(2);
    expect(a.listItemCount).toBe(3);
  });

  it("treats a name inside a no-information sentence as echo, not a mention", () => {
    const a = analyzeDeterministic("I could not find reliable information about RSM Karate in Rancho Santa Margarita. Try Google Maps.", "RSM Karate", null);
    expect(a.mentioned).toBe(false);
    expect(a.echoOnly).toBe(true);
    const b = analyzeDeterministic("RSM Karate is a well-reviewed Kenpo dojo. I don't have information about its pricing.", "RSM Karate", null);
    expect(b.mentioned).toBe(true);
    expect(b.echoOnly).toBe(false);
    const merged = mergeAnalysis(a, { mentioned: true, sentiment: "neutral", accuracy: "unverifiable", accuracyNotes: "", businesses: [] }, "RSM Karate");
    expect(merged.mentioned).toBe(false);
  });

  it("returns a null span when not mentioned", () => {
    const a = analyzeDeterministic("- Alpha\n- Beta", "Riverside Family Dental", null);
    expect(a.mentioned).toBe(false);
    expect(a.mentionStart).toBeNull();
    expect(a.listItemCount).toBe(2);
  });
});

describe("parseClassifierOutput + mergeAnalysis", () => {
  it("parses fenced JSON and derives competitor positions", () => {
    const text = '```json\n{"mentioned": true, "sentiment": "positive", "accuracy": "accurate", "accuracyNotes": "", "businesses": [{"name": "Alpha Dental", "domain": "www.alpha.com", "isTarget": false}, {"name": "Riverside Family Dental", "domain": null, "isTarget": false}, {"name": "Alpha Dental", "domain": null, "isTarget": false}]}\n```';
    const parsed = parseClassifierOutput(text);
    expect(parsed?.businesses).toHaveLength(3);
    const merged = mergeAnalysis(
      analyzeDeterministic("Alpha Dental then Riverside Family Dental", "Riverside Family Dental", null),
      parsed,
      "Riverside Family Dental"
    );
    expect(merged.mentionPosition).toBe(2);
    expect(merged.competitors).toEqual([{ name: "Alpha Dental", domain: "alpha.com", position: 1 }]);
    expect(merged.sentiment).toBe("positive");
    expect(merged.classifierUsed).toBe(true);
  });

  it("falls back to list rank without a classifier and never marks sentiment when unmentioned", () => {
    const merged = mergeAnalysis(analyzeDeterministic("1. Alpha\n2. Beta", "Riverside Family Dental", null), null, "Riverside Family Dental");
    expect(merged.mentioned).toBe(false);
    expect(merged.mentionPosition).toBeNull();
    expect(merged.sentiment).toBeNull();
    expect(merged.classifierUsed).toBe(false);
  });

  it("rejects malformed classifier output", () => {
    expect(parseClassifierOutput("not json")).toBeNull();
    expect(parseClassifierOutput('{"mentioned": "yes", "sentiment": "great"}')?.sentiment).toBe("not_applicable");
  });
});
