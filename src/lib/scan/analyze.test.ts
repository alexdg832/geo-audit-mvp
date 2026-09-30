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
    expect(normalizeBusinessName("John Smith DDS, PC")).toBe("john smith");
  });

  it("only strips suffixes at the end of the name", () => {
    expect(normalizeBusinessName("Co-op Market")).toBe("co op market");
    expect(normalizeBusinessName("PC Repair Shop")).toBe("pc repair shop");
    expect(normalizeBusinessName("Plumbing Services Co")).toBe("plumbing services");
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

  it("does not match a bare category word when the name has a single distinctive token", () => {
    const answer = "Here are the best dental clinics in Irvine: 1. Alpha Dental 2. Bright Smiles Dentistry";
    expect(findMentions(answer, "Family Dental Center", null)).toHaveLength(0);
    expect(findMentions("The best pizza in town is at Tony's Pizza.", "The Pizza Company", null)).toHaveLength(0);
    expect(findMentions("Try the karate school downtown.", "Karate Studio", null)).toHaveLength(0);
    expect(findMentions("Plumbing is expensive.", "Plumbing Services Co", null)).toHaveLength(0);
    // The full name still matches.
    expect(findMentions("Family Dental Center is open late.", "Family Dental Center", null).map((m) => m.text)).toEqual(["Family Dental Center"]);
    expect(findMentions("Call The Pizza Company on Main St.", "The Pizza Company", null)).toHaveLength(1);
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
    const merged = mergeAnalysis(a, { mentioned: true, sentiment: "neutral", accuracy: "unverifiable", accuracyNotes: "", ambiguity: null, businesses: [] }, "RSM Karate");
    expect(merged.mentioned).toBe(false);
  });

  it("does not treat a positive sentence with a bare 'no' as an echo", () => {
    const cases = [
      "RSM Karate is a great choice: no long-term contracts, and its Google reviews are excellent.",
      "RSM Karate has no hidden fees and shows strong results for students.",
      "RSM Karate is well regarded; no waitlist currently, according to recent listings.",
    ];
    for (const answer of cases) {
      const a = analyzeDeterministic(answer, "RSM Karate", "rsmkarate.com");
      expect(a.mentioned, answer).toBe(true);
      expect(a.echoOnly, answer).toBe(false);
    }
  });

  it("scopes the no-information check to the clause naming the business", () => {
    const caveat = analyzeDeterministic("- RSM Karate: a well-reviewed Kenpo dojo, though I don't have information about its pricing.", "RSM Karate", null);
    expect(caveat.mentioned).toBe(true);
    expect(caveat.echoOnly).toBe(false);
    // The no-information statement still counts when the name only introduces the clause.
    const echoes = [
      "Unfortunately, I couldn't find any information about RSM Karate.",
      "As for RSM Karate, I don't have any details.",
      "**RSM Karate** — I could not find information about this business.",
      "I'm not familiar with RSM Karate, but similar schools include Alpha Karate.",
    ];
    for (const answer of echoes) {
      const a = analyzeDeterministic(answer, "RSM Karate", null);
      expect(a.mentioned, answer).toBe(false);
      expect(a.echoOnly, answer).toBe(true);
    }
  });

  it("returns a null span when not mentioned", () => {
    const a = analyzeDeterministic("- Alpha\n- Beta", "Riverside Family Dental", null);
    expect(a.mentioned).toBe(false);
    expect(a.mentionStart).toBeNull();
    expect(a.listItemCount).toBe(2);
  });

  it("counts only top-level list items, not nested sub-bullets", () => {
    const answer = "1. Alpha Dental\n   - Known for implants\n   - Open Saturdays\n2. Riverside Family Dental\n   - Family friendly\n3. Gamma Smiles";
    const a = analyzeDeterministic(answer, "Riverside Family Dental", null);
    expect(a.listRank).toBe(2);
    expect(a.listItemCount).toBe(3);
    const markdown = "1. **Alpha Dental**\n  * Known for implants\n2. **Riverside Family Dental**\n  * Family friendly\n3. **Gamma Smiles**";
    const b = analyzeDeterministic(markdown, "Riverside Family Dental", null);
    expect(b.listRank).toBe(2);
    expect(b.listItemCount).toBe(3);
    // A mention inside a sub-bullet is not an item of its own.
    const nested = analyzeDeterministic("1. Alpha Dental\n   - Cheaper than Riverside Family Dental\n2. Beta Dental", "Riverside Family Dental", null);
    expect(nested.mentioned).toBe(true);
    expect(nested.listRank).toBeNull();
    expect(nested.listItemCount).toBe(2);
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

  it("parses booleans strictly so the string \"false\" is not true", () => {
    const parsed = parseClassifierOutput(
      '{"mentioned": "false", "sentiment": "not_applicable", "accuracy": "not_applicable", "accuracyNotes": "", "ambiguity": null, "businesses": [{"name": "Summit Dental", "domain": null, "isTarget": "false"}]}'
    );
    expect(parsed?.mentioned).toBe(false);
    expect(parsed?.businesses).toEqual([{ name: "Summit Dental", domain: null, isTarget: false }]);
    expect(parseClassifierOutput('{"mentioned": "true", "businesses": [{"name": "Acme Dental", "isTarget": "TRUE"}]}')).toMatchObject({
      mentioned: true,
      businesses: [{ name: "Acme Dental", isTarget: true }],
    });
    const merged = mergeAnalysis(analyzeDeterministic("Summit Dental is great.", "Acme Dental", null), parsed, "Acme Dental");
    expect(merged.mentioned).toBe(false);
    expect(merged.competitors).toEqual([{ name: "Summit Dental", domain: null, position: 1 }]);
  });

  it("lets the classifier veto a text match that describes a namesake elsewhere", () => {
    const answer = "For a family dentist I'd recommend Riverside Family Dental in Austin, TX.";
    const deterministic = analyzeDeterministic(answer, "Riverside Family Dental", null);
    expect(deterministic.mentioned).toBe(true);
    const ambiguity = "Describes a practice of the same name in Austin, TX.";
    const merged = mergeAnalysis(
      deterministic,
      { mentioned: false, sentiment: "positive", accuracy: "not_applicable", accuracyNotes: "", ambiguity, businesses: [{ name: "Riverside Family Dental", domain: null, isTarget: false }] },
      "Riverside Family Dental"
    );
    expect(merged.mentioned).toBe(false);
    expect(merged.mentionPosition).toBeNull();
    expect(merged.sentiment).toBe("not_applicable");
    expect(merged.ambiguity).toBe(ambiguity);
    // Also vetoed when the classifier leaves the target out of the businesses it saw.
    const omitted = mergeAnalysis(
      deterministic,
      { mentioned: false, sentiment: "not_applicable", accuracy: "not_applicable", accuracyNotes: "", ambiguity: null, businesses: [{ name: "Alpha Dental", domain: null, isTarget: false }] },
      "Riverside Family Dental"
    );
    expect(omitted.mentioned).toBe(false);
    // An inconsistent classifier (target listed, no ambiguity) does not override the text.
    const inconsistent = mergeAnalysis(
      deterministic,
      { mentioned: false, sentiment: "positive", accuracy: "accurate", accuracyNotes: "", ambiguity: null, businesses: [{ name: "Riverside Family Dental", domain: null, isTarget: true }] },
      "Riverside Family Dental"
    );
    expect(inconsistent.mentioned).toBe(true);
    expect(inconsistent.mentionPosition).toBe(1);
  });

  it("lets a corroborated classifier lift a heuristic echo", () => {
    // "couldn't ... reviews" trips the no-information heuristic on a genuine recommendation.
    const deterministic = analyzeDeterministic("RSM Karate couldn't have better reviews.", "RSM Karate", null);
    expect(deterministic.echoOnly).toBe(true);
    const classifier = { mentioned: true, sentiment: "positive" as const, accuracy: "unverifiable" as const, accuracyNotes: "", ambiguity: null };
    const lifted = mergeAnalysis(deterministic, { ...classifier, businesses: [{ name: "RSM Karate", domain: null, isTarget: true }] }, "RSM Karate");
    expect(lifted.mentioned).toBe(true);
    expect(lifted.mentionPosition).toBe(1);
    expect(lifted.sentiment).toBe("positive");
    // Without the target in the businesses list the echo guard holds.
    expect(mergeAnalysis(deterministic, { ...classifier, businesses: [] }, "RSM Karate").mentioned).toBe(false);
  });
});
