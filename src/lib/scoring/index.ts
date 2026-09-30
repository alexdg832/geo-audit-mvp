import { isEntityType } from "@/lib/scan/entityTypes";
import type {
  CapApplied,
  Confidence,
  CostOfInaction,
  CriticalFailure,
  EvidenceLabel,
  EvidenceRefs,
  MetricResult,
  PillarKey,
  PillarResult,
  RoadmapItem,
  RunInput,
  ScoringInput,
  ScoringOutput,
} from "./types";

export const SCORING_VERSION = "1.1.0";

export const PILLARS: { key: PillarKey; label: string; weight: number; description: string }[] = [
  { key: "ai_visibility", label: "AI Visibility", weight: 30, description: "How often, how prominently and on how many engines AI names you." },
  { key: "source_authority", label: "Source Authority", weight: 20, description: "The trustworthiness of the sources AI relies on when it talks about you." },
  { key: "entity_clarity", label: "Entity Clarity", weight: 15, description: "Whether AI can identify you as a distinct business with consistent facts." },
  { key: "content_answerability", label: "Content Answerability", weight: 15, description: "How easily AI can lift clear, current answers from your own site." },
  { key: "technical_readiness", label: "Technical AI Readiness", weight: 10, description: "Whether AI crawlers can reach, render and index your site." },
  { key: "competitive_position", label: "Competitive Position", weight: 10, description: "Your share of AI recommendations against the competitors it names instead." },
];

export const GRADE_BANDS: { min: number; grade: string; tone: "bad" | "mid" | "good" }[] = [
  { min: 85, grade: "Dominant", tone: "good" },
  { min: 65, grade: "Strong", tone: "good" },
  { min: 45, grade: "Fair", tone: "mid" },
  { min: 25, grade: "Poor", tone: "bad" },
  { min: 0, grade: "Critical", tone: "bad" },
];

export const CAP_DEFINITIONS = [
  { key: "no_mentions", ceiling: 35, description: "No live engine mentioned the business in any completed answer." },
  { key: "no_live_engines", ceiling: 40, description: "No engine answer was collected (no engine was live, or every check failed), so visibility could not be measured." },
  { key: "site_unreachable", ceiling: 60, description: "A website was provided but could not be fetched." },
  { key: "crawlers_blocked", ceiling: 70, description: "robots.txt blocks every major AI search crawler." },
];

/** User-agents whose access most directly determines whether AI search can read the site. */
export const KEY_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Googlebot",
];

const SEARCH_CRAWLERS = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"];

/**
 * Crawlers that fetch pages while an engine is answering: the search indexers plus the live
 * user-fetch agents. The remaining KEY_CRAWLERS (GPTBot, ClaudeBot, Google-Extended) only gather
 * training data, so blocking them alone does not stop AI answers from reading the site.
 */
const ANSWER_CRAWLERS = [...SEARCH_CRAWLERS, "ChatGPT-User", "Claude-User", "Perplexity-User"];

export function gradeFor(score: number): { grade: string; tone: "bad" | "mid" | "good" } {
  const band = GRADE_BANDS.find((b) => score >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1];
  return { grade: band.grade, tone: band.tone };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

interface MetricSpec {
  pillar: PillarKey;
  metric: string;
  title: string;
  label: EvidenceLabel;
  weight: number;
  value: number | null;
  confidence: Confidence;
  finding: string;
  evidence: EvidenceRefs;
}

function metric(spec: MetricSpec): MetricResult {
  const value = spec.value === null ? null : Math.max(0, Math.min(1, spec.value));
  const points = value === null ? 0 : round1(value * spec.weight);
  return { ...spec, value, points, pointsLost: round1(spec.weight - points) };
}

function worst(...levels: Confidence[]): Confidence {
  if (levels.includes("low")) return "low";
  if (levels.includes("medium")) return "medium";
  return "high";
}

function positionScore(position: number | null): number {
  if (position === null) return 0.5;
  if (position <= 1) return 1;
  if (position === 2) return 0.75;
  if (position === 3) return 0.5;
  if (position <= 5) return 0.3;
  return 0.15;
}

const TIER_SCORE: Record<1 | 2 | 3 | 4, number> = { 1: 0.85, 2: 1, 3: 0.6, 4: 0.2 };

export function computeScore(input: ScoringInput): ScoringOutput {
  const completed = input.runs.filter((r) => r.status === "complete");
  const mentionedRuns = completed.filter((r) => r.mentioned === true);
  // An engine counts as measured when the roster says it is live OR it returned at least one
  // answer: an engine tripped by a fatal error after completing runs still contributed evidence,
  // and its roster status is never promoted back to "live".
  const measuredEngineIds = new Set([...input.engines.filter((e) => e.status === "live").map((e) => e.id), ...completed.map((r) => r.engine)]);
  const measuredEngines = measuredEngineIds.size;
  const ids = (runs: RunInput[]) => runs.map((r) => r.id);
  const site = input.site;
  const siteKnown = Boolean(site && site.fetchOk);
  const websiteGiven = Boolean(site?.url);

  // ---- repeated-run agreement -------------------------------------------------
  const groups = new Map<string, RunInput[]>();
  for (const r of completed) {
    const key = `${r.engine}:${r.promptIndex}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const groupValues: number[] = [];
  let disagreeing = 0;
  let repeated = 0;
  for (const runs of groups.values()) {
    const values = runs.map((r) => (r.mentioned ? 1 : 0));
    groupValues.push(median(values));
    if (runs.length > 1) {
      repeated += 1;
      if (new Set(values).size > 1) disagreeing += 1;
    }
  }
  const disagreementRate = repeated ? disagreeing / repeated : 0;
  const mentionRate = groupValues.length ? mean(groupValues) : 0;
  const visibilityConfidence: Confidence =
    completed.length < 4 || measuredEngines === 0
      ? "low"
      : disagreementRate > 0.5
        ? "low"
        : disagreementRate > 0.2 || measuredEngines < 2
          ? "medium"
          : "high";

  const metrics: MetricResult[] = [];

  // ---- AI Visibility (30) ------------------------------------------------------
  metrics.push(
    metric({
      pillar: "ai_visibility",
      metric: "mention_rate",
      title: "Mention rate",
      label: "evidence-backed",
      weight: 15,
      value: completed.length ? mentionRate : null,
      confidence: visibilityConfidence,
      finding: completed.length
        ? mentionedRuns.length === 0
          ? `Not mentioned in any of the ${completed.length} answers collected across ${measuredEngines} engine${measuredEngines === 1 ? "" : "s"}.`
          : `Mentioned in ${pct(mentionRate)} of prompts (median across repeated runs): ${mentionedRuns.length} of ${completed.length} answers.`
        : "No engine answers were collected, so visibility could not be measured.",
      evidence: { runIds: ids(completed) },
    })
  );
  const prominence = mentionedRuns.length ? mean(mentionedRuns.map((r) => positionScore(r.mentionPosition))) : 0;
  const firstPlace = mentionedRuns.filter((r) => r.mentionPosition === 1).length;
  metrics.push(
    metric({
      pillar: "ai_visibility",
      metric: "prominence",
      title: "Prominence when mentioned",
      label: "heuristic",
      weight: 6,
      value: completed.length ? prominence : null,
      confidence: visibilityConfidence,
      finding: mentionedRuns.length
        ? `Named first in ${firstPlace} of ${mentionedRuns.length} answers that mention you; average position score ${pct(prominence)}.`
        : completed.length
          ? "Never mentioned, so you hold no position in any answer."
          : "No engine answers were collected, so position could not be measured.",
      evidence: { runIds: ids(mentionedRuns.length ? mentionedRuns : completed) },
    })
  );
  const enginesWithMention = new Set(mentionedRuns.map((r) => r.engine));
  metrics.push(
    metric({
      pillar: "ai_visibility",
      metric: "engine_coverage",
      title: "Engine coverage",
      label: "evidence-backed",
      weight: 6,
      // completed.length > 0 implies measuredEngines > 0, so the division is safe.
      value: completed.length ? enginesWithMention.size / measuredEngines : null,
      confidence: completed.length ? visibilityConfidence : "low",
      finding: completed.length
        ? `${enginesWithMention.size} of ${measuredEngines} engines mentioned you at least once${enginesWithMention.size ? ` (${[...enginesWithMention].map((e) => input.engines.find((x) => x.id === e)?.label ?? e).join(", ")})` : ""}.`
        : "No engine answers were collected, so coverage could not be measured.",
      evidence: { runIds: ids(completed) },
    })
  );
  const brandRuns = completed.filter((r) => r.promptKind === "brand_direct");
  const brandMentioned = brandRuns.filter((r) => r.mentioned);
  metrics.push(
    metric({
      pillar: "ai_visibility",
      metric: "brand_recognition",
      title: "Direct brand recognition",
      label: "heuristic",
      weight: 3,
      value: brandRuns.length ? brandMentioned.length / brandRuns.length : null,
      confidence: brandRuns.length >= 2 ? visibilityConfidence : "low",
      finding: brandRuns.length
        ? `When asked about you by name, engines recognised you in ${brandMentioned.length} of ${brandRuns.length} answers.`
        : "No direct brand prompts were completed.",
      evidence: { runIds: ids(brandRuns) },
    })
  );

  // ---- Source Authority (20) ---------------------------------------------------
  const citedMentionRuns = mentionedRuns.filter((r) => r.citations.length > 0);
  const relevantCitations = citedMentionRuns.flatMap((r) => r.citations);
  const citationIds = relevantCitations.map((c) => c.id);
  const sourceConfidence: Confidence = relevantCitations.length >= 10 ? "high" : relevantCitations.length >= 4 ? "medium" : "low";
  const tier4 = relevantCitations.filter((c) => c.tier === 4);
  const noSourceRuns = mentionedRuns.filter((r) => r.noCitations);
  const quality = relevantCitations.length ? mean(relevantCitations.map((c) => TIER_SCORE[c.tier])) : 0;
  const noMentionNote = "No engine mentioned you, so no source could be supporting you.";
  metrics.push(
    metric({
      pillar: "source_authority",
      metric: "citation_quality",
      title: "Trust tier of supporting sources",
      label: "heuristic",
      weight: 10,
      value: mentionedRuns.length ? quality : completed.length ? 0 : null,
      confidence: sourceConfidence,
      finding: !completed.length
        ? "No answers collected."
        : !mentionedRuns.length
          ? noMentionNote
          : relevantCitations.length
            ? `${relevantCitations.length} sources support answers that mention you: ${[1, 2, 3, 4].map((t) => `${relevantCitations.filter((c) => c.tier === t).length} tier ${t}`).join(", ")}.`
            : `Engines mentioned you in ${mentionedRuns.length} answers but provided no source for any of them.`,
      evidence: { citationIds, runIds: ids(mentionedRuns) },
    })
  );
  const ownCited = citedMentionRuns.filter((r) => r.citations.some((c) => c.isBusinessOwned));
  metrics.push(
    metric({
      pillar: "source_authority",
      metric: "own_site_cited",
      title: "Your own site is cited",
      label: "evidence-backed",
      weight: 5,
      value: mentionedRuns.length ? (citedMentionRuns.length ? ownCited.length / citedMentionRuns.length : 0) : completed.length ? 0 : null,
      confidence: sourceConfidence,
      finding: !completed.length
        ? "No answers collected."
        : !mentionedRuns.length
          ? noMentionNote
          : citedMentionRuns.length
            ? `Your website was cited in ${ownCited.length} of ${citedMentionRuns.length} sourced answers about you.`
            : "No sourced answer about you exists, so your site was never cited.",
      evidence: { citationIds: ownCited.flatMap((r) => r.citations.filter((c) => c.isBusinessOwned).map((c) => c.id)), runIds: ids(citedMentionRuns) },
    })
  );
  metrics.push(
    metric({
      pillar: "source_authority",
      metric: "low_trust_dependence",
      title: "Independence from low-trust sources",
      label: "heuristic",
      weight: 5,
      value: relevantCitations.length ? 1 - tier4.length / relevantCitations.length : mentionedRuns.length ? 0 : completed.length ? 0 : null,
      confidence: sourceConfidence,
      finding: !completed.length
        ? "No answers collected."
        : !mentionedRuns.length
          ? noMentionNote
          : relevantCitations.length
            ? `${pct(tier4.length / relevantCitations.length)} of the sources behind answers about you are forums, social posts or other low-trust pages.`
            : `Engines gave no sources in ${noSourceRuns.length} answers about you, so nothing trustworthy anchors your reputation.`,
      evidence: { citationIds: tier4.map((c) => c.id), runIds: ids(noSourceRuns) },
    })
  );

  // ---- Entity Clarity (15) -----------------------------------------------------
  const siteConfidence: Confidence = !websiteGiven ? "high" : siteKnown ? (site!.unknown.length ? "medium" : "high") : "low";
  const siteMissing = !websiteGiven ? "No website was provided." : !siteKnown ? `Website could not be fetched (${site?.fetchError ?? "unknown error"}).` : null;
  const siteValue = (v: boolean | null | undefined): number | null => (siteMissing ? (websiteGiven ? null : 0) : v ? 1 : 0);
  // For checks the site scan records as unknown (null) when the file could not be fetched: absence
  // of evidence is not evidence of absence, so the metric is unmeasured rather than failed.
  const siteValueOrUnknown = (v: boolean | null | undefined): number | null => (siteMissing ? (websiteGiven ? null : 0) : v === null || v === undefined ? null : v ? 1 : 0);
  // Same predicate the site scan uses to pick the entity node, so schema_present can never
  // disagree with schema_nap about whether the page describes the business.
  const entityTypes = (site?.schemaTypes ?? []).filter(isEntityType);
  metrics.push(
    metric({
      pillar: "entity_clarity",
      metric: "schema_present",
      title: "Structured business data (schema.org)",
      label: "heuristic",
      weight: 5,
      value: siteValue(entityTypes.length > 0),
      confidence: siteConfidence,
      finding: siteMissing ?? (entityTypes.length ? `JSON-LD found: ${entityTypes.slice(0, 4).join(", ")}.` : `No Organization/LocalBusiness JSON-LD on the homepage${site?.schemaTypes.length ? ` (found only: ${site.schemaTypes.slice(0, 4).join(", ")})` : ""}.`),
      evidence: { siteCheckFields: ["schemaTypes"] },
    })
  );
  metrics.push(
    metric({
      pillar: "entity_clarity",
      metric: "schema_nap",
      title: "Name, phone and address in structured data",
      label: "heuristic",
      weight: 3,
      value: siteValue(site?.schemaHasNap),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.schemaHasNap ? "Structured data carries your name with a phone number or address." : "Structured data does not state your phone number or address."),
      evidence: { siteCheckFields: ["schemaHasNap"] },
    })
  );
  metrics.push(
    metric({
      pillar: "entity_clarity",
      metric: "nap_on_page",
      title: "Contact details visible on the page",
      label: "heuristic",
      weight: 3,
      value: siteValue(site?.hasContactInfo),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.hasContactInfo ? `Detected ${[site.detectedPhone ? "a phone number" : null, site.detectedAddress ? "an address" : null].filter(Boolean).join(" and ") || "contact details"} on the homepage.` : "No phone number, address or email is visible on the homepage."),
      evidence: { siteCheckFields: ["detectedPhone", "detectedAddress", "hasContactInfo"] },
    })
  );
  const titleMeta = site ? (site.title ? 0.5 : 0) + (site.metaDescription ? 0.5 : 0) : 0;
  metrics.push(
    metric({
      pillar: "entity_clarity",
      metric: "title_meta",
      title: "Descriptive title and meta description",
      label: "heuristic",
      weight: 2,
      value: siteMissing ? (websiteGiven ? null : 0) : titleMeta,
      confidence: siteConfidence,
      finding: siteMissing ?? (titleMeta === 1 ? "Both a title and a meta description are present." : titleMeta === 0.5 ? `Missing ${site?.title ? "a meta description" : "a page title"}.` : "Missing both the page title and the meta description."),
      evidence: { siteCheckFields: ["title", "metaDescription"] },
    })
  );
  const accuracyRuns = mentionedRuns.filter((r) => r.accuracy && r.accuracy !== "not_applicable");
  const accuracyValue = accuracyRuns.length ? mean(accuracyRuns.map((r) => (r.accuracy === "accurate" ? 1 : r.accuracy === "unverifiable" ? 0.7 : 0))) : null;
  const inaccurate = accuracyRuns.filter((r) => r.accuracy === "inaccurate");
  metrics.push(
    metric({
      pillar: "entity_clarity",
      metric: "fact_accuracy",
      title: "Accuracy of what AI says about you",
      label: "evidence-backed",
      weight: 2,
      value: accuracyValue,
      confidence: accuracyRuns.length >= 6 ? "high" : accuracyRuns.length >= 3 ? "medium" : "low",
      finding: accuracyRuns.length
        ? inaccurate.length
          ? `${inaccurate.length} of ${accuracyRuns.length} answers about you contain claims that conflict with your own facts.`
          : `No conflicting claims found in ${accuracyRuns.length} answers about you.`
        : mentionedRuns.length
          ? "Answers about you could not be checked against your facts."
          : "Not mentioned, so accuracy could not be assessed.",
      evidence: { runIds: ids(inaccurate.length ? inaccurate : accuracyRuns) },
    })
  );

  // ---- Content Answerability (15) ---------------------------------------------
  metrics.push(
    metric({
      pillar: "content_answerability",
      metric: "meta_description",
      title: "Meta description",
      label: "heuristic",
      weight: 2,
      value: siteValue(Boolean(site?.metaDescription)),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.metaDescription ? "A meta description summarises the page." : "No meta description to summarise what you do."),
      evidence: { siteCheckFields: ["metaDescription"] },
    })
  );
  metrics.push(
    metric({
      pillar: "content_answerability",
      metric: "h1",
      title: "Clear main heading",
      label: "heuristic",
      weight: 2,
      value: siteValue(Boolean(site?.h1)),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.h1 ? `Main heading: “${site.h1.slice(0, 80)}”.` : "The homepage has no H1 heading."),
      evidence: { siteCheckFields: ["h1"] },
    })
  );
  const words = site?.wordCount ?? 0;
  const depth = words >= 500 ? 1 : words >= 250 ? 0.6 : words >= 100 ? 0.3 : 0;
  metrics.push(
    metric({
      pillar: "content_answerability",
      metric: "content_depth",
      title: "Enough readable text",
      label: "heuristic",
      weight: 3,
      value: siteMissing ? (websiteGiven ? null : 0) : depth,
      confidence: siteConfidence,
      finding: siteMissing ?? `${words} words of readable text on the homepage.`,
      evidence: { siteCheckFields: ["wordCount"] },
    })
  );
  metrics.push(
    metric({
      pillar: "content_answerability",
      metric: "hours",
      title: "Opening hours stated",
      label: "evidence-backed",
      weight: 3,
      value: siteValue(site?.hasHours),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.hasHours ? "Opening hours are stated on the homepage or in structured data." : "No opening hours found on the homepage."),
      evidence: { siteCheckFields: ["hasHours"] },
    })
  );
  metrics.push(
    metric({
      pillar: "content_answerability",
      metric: "faq",
      title: "Question-and-answer content",
      label: "heuristic",
      weight: 2,
      value: siteValue(site?.hasFaq),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.hasFaq ? "FAQ content or FAQPage markup is present." : "No FAQ section or FAQPage markup found."),
      evidence: { siteCheckFields: ["hasFaq"] },
    })
  );
  metrics.push(
    metric({
      pillar: "content_answerability",
      metric: "about_page",
      title: "About page",
      label: "heuristic",
      weight: 3,
      value: siteValue(site?.hasAboutPage),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.hasAboutPage ? "An About page is linked from the homepage." : "No About page is linked from the homepage."),
      evidence: { siteCheckFields: ["hasAboutPage"] },
    })
  );

  // ---- Technical AI Readiness (10) --------------------------------------------
  const robots = site?.robots ?? null;
  const robotsKnown = siteKnown && robots !== null;
  const allowed = robotsKnown ? KEY_CRAWLERS.filter((a) => robots![a] !== false) : [];
  const blocked = robotsKnown ? KEY_CRAWLERS.filter((a) => robots![a] === false) : [];
  metrics.push(
    metric({
      pillar: "technical_readiness",
      metric: "crawler_access",
      title: "AI crawlers allowed",
      label: "evidence-backed",
      weight: 4,
      value: siteMissing ? (websiteGiven ? null : 0) : robotsKnown ? allowed.length / KEY_CRAWLERS.length : null,
      confidence: robotsKnown ? siteConfidence : "low",
      finding: siteMissing ?? (robotsKnown ? (blocked.length ? `robots.txt blocks ${blocked.join(", ")}.` : site?.robotsFound ? "robots.txt allows every AI crawler we check." : "No robots.txt, so every crawler is allowed by default.") : "robots.txt could not be fetched."),
      evidence: { siteCheckFields: ["robots", "robotsFound"] },
    })
  );
  metrics.push(
    metric({
      pillar: "technical_readiness",
      metric: "https",
      title: "HTTPS",
      label: "evidence-backed",
      weight: 1,
      value: siteValue(site?.https),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.https ? "Served over HTTPS." : "Not served over HTTPS."),
      evidence: { siteCheckFields: ["https", "finalUrl"] },
    })
  );
  metrics.push(
    metric({
      pillar: "technical_readiness",
      metric: "rendering",
      title: "Content readable without JavaScript",
      label: "evidence-backed",
      weight: 2,
      value: siteValue(site ? site.jsRequired === false : null),
      confidence: siteConfidence,
      finding: siteMissing ?? (site?.jsRequired ? "The homepage delivers almost no text without JavaScript; most AI crawlers do not execute scripts." : "The homepage text is present in the raw HTML."),
      evidence: { siteCheckFields: ["jsRequired", "wordCount", "textRatio"] },
    })
  );
  metrics.push(
    metric({
      pillar: "technical_readiness",
      metric: "sitemap",
      title: "XML sitemap",
      label: "heuristic",
      weight: 1,
      value: siteValueOrUnknown(site?.sitemapFound),
      confidence: siteKnown && site!.sitemapFound === null ? "low" : siteConfidence,
      finding: siteMissing ?? (site?.sitemapFound === null ? "The sitemap could not be fetched." : site?.sitemapFound ? `Sitemap found at ${site.sitemapUrl}.` : "No XML sitemap found."),
      evidence: { siteCheckFields: ["sitemapFound", "sitemapUrl"] },
    })
  );
  metrics.push(
    metric({
      pillar: "technical_readiness",
      metric: "llms_txt",
      title: "llms.txt",
      label: "heuristic",
      weight: 1,
      value: siteValueOrUnknown(site?.llmsTxtFound),
      confidence: siteKnown && site!.llmsTxtFound === null ? "low" : siteConfidence,
      finding: siteMissing ?? (site?.llmsTxtFound === null ? "llms.txt could not be fetched." : site?.llmsTxtFound ? "An llms.txt file is present." : "No llms.txt file."),
      evidence: { siteCheckFields: ["llmsTxtFound"] },
    })
  );
  const ms = site?.responseMs ?? null;
  const speed = ms === null ? null : ms <= 800 ? 1 : ms <= 2000 ? 0.5 : 0;
  metrics.push(
    metric({
      pillar: "technical_readiness",
      metric: "speed",
      title: "Response time",
      label: "heuristic",
      weight: 1,
      value: siteMissing ? (websiteGiven ? null : 0) : speed,
      confidence: siteConfidence,
      finding: siteMissing ?? (ms === null ? "Response time unavailable." : `Homepage responded in ${ms} ms.`),
      evidence: { siteCheckFields: ["responseMs"] },
    })
  );

  // ---- Competitive Position (10) ----------------------------------------------
  const competitors = [...input.competitors].sort((a, b) => b.runCount - a.runCount);
  const top = competitors[0] ?? null;
  // Competitors only exist when the classifier ran. Any detected competitor proves it did; otherwise
  // fall back to the per-run flag, or to the sentiment/accuracy fields, which mergeAnalysis sets
  // (even to "not_applicable") only when the classifier produced output.
  const classifierRuns = completed.filter((r) => r.classifierUsed ?? (r.sentiment !== null || r.accuracy !== null));
  const competitorsMeasured = competitors.length > 0 || classifierRuns.length > 0;
  const competitiveConfidence: Confidence = !competitorsMeasured ? "low" : classifierRuns.length < completed.length ? worst("medium", visibilityConfidence) : visibilityConfidence;
  const unmeasuredCompetitors = "Competitor extraction was unavailable (no classifier engine ran), so this could not be measured.";
  // Never mentioned is a measured zero whether or not competitors were extracted; a mentioned
  // business with no competitor extraction has an unknowable share and rank.
  const sov = !completed.length ? null : mentionedRuns.length === 0 ? 0 : !competitorsMeasured ? null : mentionedRuns.length / (mentionedRuns.length + (top?.runCount ?? 0));
  metrics.push(
    metric({
      pillar: "competitive_position",
      metric: "share_of_voice",
      title: "Share of voice vs. top competitor",
      label: "evidence-backed",
      weight: 6,
      value: sov,
      confidence: competitiveConfidence,
      finding: !completed.length
        ? "No answers collected."
        : top
          ? `You appeared in ${mentionedRuns.length} answers; ${top.name} appeared in ${top.runCount}.`
          : !competitorsMeasured
            ? mentionedRuns.length
              ? unmeasuredCompetitors
              : "Never mentioned, so you hold no share of voice."
            : mentionedRuns.length
              ? "No competitor was named alongside you."
              : "Engines named no specific businesses at all.",
      evidence: { competitorIds: top ? [top.id] : [], runIds: ids(mentionedRuns) },
    })
  );
  const ranking = [{ name: input.businessName, runCount: mentionedRuns.length, self: true }, ...competitors.map((c) => ({ name: c.name, runCount: c.runCount, self: false }))].sort((a, b) => b.runCount - a.runCount);
  const rank = ranking.findIndex((r) => r.self) + 1;
  const rankValue = !completed.length ? null : mentionedRuns.length === 0 ? 0 : !competitorsMeasured ? null : rank === 1 ? 1 : rank === 2 ? 0.6 : rank === 3 ? 0.3 : 0;
  metrics.push(
    metric({
      pillar: "competitive_position",
      metric: "rank_vs_competitors",
      title: "Rank among businesses AI names",
      label: "heuristic",
      weight: 4,
      value: rankValue,
      confidence: competitiveConfidence,
      finding: !completed.length
        ? "No answers collected."
        : mentionedRuns.length === 0
          ? competitorsMeasured
            ? `Unranked: engines named ${competitors.length} other businesses and never you.`
            : "Unranked: engines never named you."
          : !competitorsMeasured
            ? unmeasuredCompetitors
            : `Ranked #${rank} of ${ranking.length} businesses by how often engines named them.`,
      evidence: { competitorIds: competitors.slice(0, 5).map((c) => c.id), runIds: ids(mentionedRuns) },
    })
  );

  // ---- pillars, caps, grade ----------------------------------------------------
  const pillars: PillarResult[] = PILLARS.map((p) => {
    const own = metrics.filter((m) => m.pillar === p.key);
    return {
      key: p.key,
      label: p.label,
      weight: p.weight,
      score: round1(own.reduce((s, m) => s + m.points, 0)),
      confidence: worst(...own.map((m) => m.confidence)),
      metrics: own,
    };
  });
  const uncappedScore = Math.round(pillars.reduce((s, p) => s + p.score, 0));

  const caps: CapApplied[] = [];
  if (completed.length > 0 && mentionedRuns.length === 0) {
    caps.push({ key: "no_mentions", ceiling: 35, reason: `No live engine mentioned ${input.businessName} in any of ${completed.length} answers.`, evidence: { runIds: ids(completed) } });
  }
  if (completed.length === 0) {
    caps.push({ key: "no_live_engines", ceiling: 40, reason: measuredEngines === 0 ? "No AI engine was live during this scan, so visibility is unmeasured." : "No AI engine returned an answer during this scan, so visibility is unmeasured.", evidence: { note: input.engines.map((e) => `${e.label}: ${e.status}`).join("; ") } });
  }
  if (websiteGiven && !siteKnown) {
    caps.push({ key: "site_unreachable", ceiling: 60, reason: `The website ${site?.url} could not be fetched: ${site?.fetchError ?? "unknown error"}.`, evidence: { siteCheckFields: ["fetchOk", "fetchError", "httpStatus"] } });
  }
  if (robotsKnown && SEARCH_CRAWLERS.every((a) => robots![a] === false)) {
    caps.push({ key: "crawlers_blocked", ceiling: 70, reason: `robots.txt blocks ${SEARCH_CRAWLERS.join(", ")}, the crawlers that feed AI search answers.`, evidence: { siteCheckFields: ["robots"] } });
  }
  const ceiling = caps.length ? Math.min(...caps.map((c) => c.ceiling)) : 100;
  const score = Math.max(0, Math.min(uncappedScore, ceiling));
  const { grade } = gradeFor(score);
  const confidence = worst(...pillars.filter((p) => p.weight >= 15).map((p) => p.confidence));

  const criticalFailures = buildCriticalFailures({ input, pillars, metrics, mentionedRuns, completed, liveEngines: measuredEngines, brandRuns: brandRuns.length, top, tier4Share: relevantCitations.length ? tier4.length / relevantCitations.length : null, tier4, inaccurate, accuracyRuns: accuracyRuns.length, blocked, siteMissing, websiteGiven, entityTypes, noSourceRuns, mentionRate });
  const roadmap = buildRoadmap(metrics);
  const costOfInaction = buildCostOfInaction(mentionRate, completed.length > 0);
  const verdict = buildVerdict({ name: input.businessName, grade, score, mentionRate, mentionedRuns: mentionedRuns.length, completed: completed.length, liveEngines: measuredEngines, top, criticalFailures });

  return {
    version: SCORING_VERSION,
    score,
    uncappedScore,
    grade,
    confidence,
    verdict,
    pillars,
    metrics,
    caps,
    criticalFailures,
    roadmap,
    costOfInaction,
    stats: {
      liveEngines: measuredEngines,
      totalRuns: input.runs.length,
      completedRuns: completed.length,
      mentionedRuns: mentionedRuns.length,
      mentionRate,
      runsWithCitations: completed.filter((r) => r.citations.length > 0).length,
      disagreementRate,
    },
  };
}

interface FailureContext {
  input: ScoringInput;
  pillars: PillarResult[];
  metrics: MetricResult[];
  mentionedRuns: RunInput[];
  completed: RunInput[];
  /** Engines with evidence (live, or with at least one completed answer). */
  liveEngines: number;
  /** Completed direct-brand prompts. */
  brandRuns: number;
  top: { id: string; name: string; runCount: number } | null;
  tier4Share: number | null;
  tier4: { id: string }[];
  inaccurate: RunInput[];
  accuracyRuns: number;
  blocked: string[];
  siteMissing: string | null;
  websiteGiven: boolean;
  entityTypes: string[];
  noSourceRuns: RunInput[];
  mentionRate: number;
}

function buildCriticalFailures(ctx: FailureContext): CriticalFailure[] {
  // Each failure carries the points lost by the sub-metrics it actually describes, so the
  // "−N pts" badge and the ordering reflect that problem rather than its whole pillar.
  const lost = (key: PillarKey) => {
    const p = ctx.pillars.find((x) => x.key === key)!;
    return round1(p.weight - p.score);
  };
  const lostMetrics = (...keys: string[]) => round1(keys.reduce((s, k) => s + (ctx.metrics.find((m) => m.metric === k)?.pointsLost ?? 0), 0));
  // Every metric read from the site scan references siteCheckFields; fact_accuracy does not.
  const lostSite = round1(ctx.metrics.filter((m) => m.evidence.siteCheckFields?.length).reduce((s, m) => s + m.pointsLost, 0));
  const failures: CriticalFailure[] = [];
  const ids = (runs: RunInput[]) => runs.map((r) => r.id);

  if (ctx.completed.length === 0) {
    failures.push({ key: "no_live_engines", title: "No AI engine could be scanned", detail: `${ctx.liveEngines === 0 ? "Every engine was missing a key or failed" : "No engine returned an answer"}, so AI visibility is unmeasured. The score is capped until a real scan runs.`, pillar: "ai_visibility", pointsLost: lost("ai_visibility"), evidence: { note: ctx.input.engines.map((e) => `${e.label}: ${e.status}`).join("; ") } });
  } else if (ctx.mentionedRuns.length === 0) {
    failures.push({ key: "invisible", title: "AI engines cannot find you", detail: `Across ${ctx.completed.length} answers from ${ctx.liveEngines} engine${ctx.liveEngines === 1 ? "" : "s"}, ${ctx.input.businessName} was never mentioned${ctx.brandRuns ? " — not even when asked about you by name" : ""}.`, pillar: "ai_visibility", pointsLost: lost("ai_visibility"), evidence: { runIds: ids(ctx.completed) } });
  } else if (ctx.mentionRate < 0.25) {
    failures.push({ key: "mostly_invisible", title: "You are missing from most AI answers", detail: `Engines mentioned you in only ${pct(ctx.mentionRate)} of prompts a customer would ask.`, pillar: "ai_visibility", pointsLost: lost("ai_visibility"), evidence: { runIds: ids(ctx.completed) } });
  }
  if (ctx.top && ctx.top.runCount > ctx.mentionedRuns.length) {
    failures.push({ key: "outranked", title: `AI recommends ${ctx.top.name} instead of you`, detail: `${ctx.top.name} was named in ${ctx.top.runCount} answers; you were named in ${ctx.mentionedRuns.length}.`, pillar: "competitive_position", pointsLost: lost("competitive_position"), evidence: { competitorIds: [ctx.top.id], runIds: ids(ctx.mentionedRuns) } });
  }
  if (ctx.tier4Share !== null && ctx.tier4Share >= 0.4) {
    failures.push({ key: "low_trust_sources", title: "Your reputation is being defined by low-trust sources", detail: `${pct(ctx.tier4Share)} of the sources behind answers about you are forums, social posts or anonymous pages.`, pillar: "source_authority", pointsLost: lostMetrics("citation_quality", "low_trust_dependence"), evidence: { citationIds: ctx.tier4.map((c) => c.id) } });
  }
  if (ctx.mentionedRuns.length && ctx.noSourceRuns.length === ctx.mentionedRuns.length) {
    failures.push({ key: "no_sources", title: "No engine can point to a source for you", detail: `Every answer that mentioned you came with no source at all, so nothing verifiable anchors what AI says.`, pillar: "source_authority", pointsLost: lost("source_authority"), evidence: { runIds: ids(ctx.noSourceRuns) } });
  }
  if (ctx.accuracyRuns && ctx.inaccurate.length / ctx.accuracyRuns >= 0.25) {
    failures.push({ key: "inaccurate", title: "AI is stating wrong facts about you", detail: `${ctx.inaccurate.length} of ${ctx.accuracyRuns} answers about you conflict with your own published facts.`, pillar: "entity_clarity", pointsLost: lostMetrics("fact_accuracy"), evidence: { runIds: ids(ctx.inaccurate) } });
  }
  if (ctx.websiteGiven && ctx.siteMissing) {
    failures.push({ key: "site_unreachable", title: "Your website could not be reached", detail: ctx.siteMissing, pillar: "technical_readiness", pointsLost: lostSite, evidence: { siteCheckFields: ["fetchOk", "fetchError", "httpStatus"] } });
  } else if (!ctx.websiteGiven) {
    failures.push({ key: "no_website", title: "AI has nothing of yours to read", detail: "No website was provided, so every on-site signal scored zero.", pillar: "content_answerability", pointsLost: lostSite, evidence: { note: "No website supplied at scan start." } });
  }
  // Only crawlers that fetch pages while answering justify a critical failure; blocking the
  // training-only agents costs crawler_access points but does not stop AI answers reading the site.
  const answerBlocked = ctx.blocked.filter((a) => ANSWER_CRAWLERS.includes(a));
  if (answerBlocked.length) {
    const trainingBlocked = ctx.blocked.filter((a) => !ANSWER_CRAWLERS.includes(a));
    failures.push({ key: "crawlers_blocked", title: "You are blocking the crawlers that feed AI answers", detail: `robots.txt disallows ${answerBlocked.join(", ")}${trainingBlocked.length ? ` (and the training-only crawlers ${trainingBlocked.join(", ")})` : ""}.`, pillar: "technical_readiness", pointsLost: lostMetrics("crawler_access"), evidence: { siteCheckFields: ["robots"] } });
  }
  if (ctx.websiteGiven && !ctx.siteMissing && ctx.entityTypes.length === 0) {
    // Without an entity node there is nothing to carry the NAP either, so both metrics are lost.
    failures.push({ key: "no_schema", title: "AI has no structured facts about your business", detail: "Your homepage carries no Organization or LocalBusiness structured data, so AI must guess who and where you are.", pillar: "entity_clarity", pointsLost: lostMetrics("schema_present", "schema_nap"), evidence: { siteCheckFields: ["schemaTypes"] } });
  }
  return failures.sort((a, b) => b.pointsLost - a.pointsLost).slice(0, 6);
}

const FIX_STEPS: Record<string, { title: string; effort: RoadmapItem["effort"]; steps: string[] }> = {
  mention_rate: { title: "Get named in AI recommendations", effort: "high", steps: ["Publish a definitive services page per core offer with plain-language answers to the questions in this report's prompt set.", "Earn listings and reviews on the platforms this report shows engines citing for your category.", "Secure two or three mentions on authoritative local or industry sites (news, associations, chambers).", "Re-scan in 30 days to measure the change in mention rate."] },
  prominence: { title: "Move up in the answers that already mention you", effort: "medium", steps: ["Strengthen review volume and recency on the top-cited review platform.", "Add comparison and 'why choose us' content that engines can quote directly.", "Ensure your name, category and location appear together on your homepage title and H1."] },
  engine_coverage: { title: "Show up on every engine, not just one", effort: "medium", steps: ["Check crawler access for the engines that never mention you (see Technical AI Readiness).", "Claim and complete profiles on the sources each missing engine tends to cite.", "Publish a llms-friendly summary of your business and services."] },
  brand_recognition: { title: "Make AI recognise your name", effort: "low", steps: ["Use one canonical business name everywhere (site, Google Business Profile, directories, social).", "Add Organization JSON-LD with name, sameAs links and a description to the homepage.", "Create or correct your Wikipedia/Wikidata-style entity references where eligible."] },
  citation_quality: { title: "Replace weak sources with authoritative ones", effort: "high", steps: ["Get listed on authoritative directories and industry bodies for your category.", "Pitch a local news feature or expert quote.", "Keep your Google Business Profile complete and active."] },
  own_site_cited: { title: "Make your own site the source AI cites", effort: "medium", steps: ["Answer the exact questions from the prompt set on your site in clear, factual sentences.", "Add FAQPage and LocalBusiness JSON-LD.", "Allow AI search crawlers in robots.txt and keep content in plain HTML."] },
  low_trust_dependence: { title: "Stop forums from defining your reputation", effort: "medium", steps: ["Respond to and resolve the specific threads cited in the Evidence Explorer where possible.", "Publish authoritative, factual pages that directly answer the claims made there.", "Grow reviews on higher-tier platforms so engines have better sources to prefer."] },
  schema_present: { title: "Add LocalBusiness structured data", effort: "low", steps: ["Add a JSON-LD block with @type set to your specific LocalBusiness subtype.", "Include name, url, telephone, address, geo, openingHoursSpecification and sameAs.", "Validate with the Schema Markup Validator and Google's Rich Results Test."] },
  schema_nap: { title: "Put name, phone and address in structured data", effort: "low", steps: ["Add telephone and a PostalAddress object to your LocalBusiness JSON-LD.", "Match the exact formatting used on your Google Business Profile."] },
  nap_on_page: { title: "Show contact details on the homepage", effort: "low", steps: ["Add your phone number (as a tel: link) and full address to the header or footer.", "Add an email link or contact form link."] },
  title_meta: { title: "Write a descriptive title and meta description", effort: "low", steps: ["Title: '<Business> — <category> in <city>' under 60 characters.", "Meta description: one factual sentence with services and location under 155 characters."] },
  fact_accuracy: { title: "Correct the facts AI gets wrong", effort: "medium", steps: ["Review each inaccurate claim in the Evidence Explorer and trace it to its cited source.", "Fix the source directly (directory listing, profile) or publish the correct fact prominently on your site.", "Keep a Truth Brief up to date so future scans can verify claims."] },
  meta_description: { title: "Add a meta description", effort: "low", steps: ["Write one factual sentence covering what you do and where.", "Keep it under 155 characters."] },
  h1: { title: "Add a clear H1 heading", effort: "low", steps: ["Use one H1 that states your category and location.", "Keep supporting headings as H2/H3."] },
  content_depth: { title: "Publish more readable, factual content", effort: "medium", steps: ["Expand the homepage to at least 300 words describing services, area served and differentiators.", "Add a dedicated page per service with plain-language answers."] },
  hours: { title: "State your opening hours", effort: "low", steps: ["Add opening hours in text on the homepage.", "Add openingHoursSpecification to your JSON-LD."] },
  faq: { title: "Add an FAQ section", effort: "low", steps: ["Answer the eight to ten questions customers ask most, one short paragraph each.", "Mark it up with FAQPage JSON-LD."] },
  about_page: { title: "Add an About page", effort: "low", steps: ["Describe who you are, since when, and who you serve.", "Link it from the main navigation."] },
  crawler_access: { title: "Allow AI crawlers in robots.txt", effort: "low", steps: ["Remove Disallow rules for the AI search crawlers listed in this report, or add explicit Allow groups.", "If your CDN blocks bots by default, allow-list the verified AI crawlers.", "Re-fetch robots.txt after publishing to confirm."] },
  https: { title: "Serve the site over HTTPS", effort: "low", steps: ["Install a certificate and redirect http:// to https://."] },
  rendering: { title: "Deliver content without JavaScript", effort: "high", steps: ["Enable server-side rendering or static generation for key pages.", "Verify the raw HTML contains your text by viewing source or fetching with curl."] },
  sitemap: { title: "Publish an XML sitemap", effort: "low", steps: ["Generate sitemap.xml and reference it in robots.txt."] },
  llms_txt: { title: "Add an llms.txt file", effort: "low", steps: ["Publish /llms.txt with a short description of your business and links to key pages.", "Treat this as a low-cost extra; evidence that engines read it is limited."] },
  speed: { title: "Speed up the homepage", effort: "medium", steps: ["Enable caching and compression, and reduce large images or scripts.", "Target a server response under 800 ms."] },
  share_of_voice: { title: "Win share of voice from the competitors AI names", effort: "high", steps: ["Study the sources cited for the top competitor in the Competitor Comparison.", "Match or exceed their presence on those sources.", "Publish comparison content addressing the criteria engines used to recommend them."] },
  rank_vs_competitors: { title: "Become the first business AI names", effort: "high", steps: ["Combine the fixes above; first-position mentions follow from source authority and review strength."] },
};

function buildRoadmap(metrics: MetricResult[]): RoadmapItem[] {
  // An unmeasured metric (value null) is not a confirmed problem, so it gets no fix steps;
  // its own finding and the critical failures already report why it could not be assessed.
  return metrics
    .filter((m) => m.value !== null && m.pointsLost > 0)
    .sort((a, b) => b.pointsLost - a.pointsLost)
    .slice(0, 10)
    .map((m, i) => {
      const fix = FIX_STEPS[m.metric] ?? { title: m.title, effort: "medium" as const, steps: [] };
      return { priority: i + 1, key: m.metric, title: fix.title, pillar: m.pillar, pointsRecoverable: m.pointsLost, effort: fix.effort, evidence: m.evidence, steps: fix.steps };
    });
}

export const COST_ASSUMPTIONS = {
  monthlyAiQueries: { label: "Customers per month asking AI for a business like yours", value: 200, note: "Placeholder assumption; replace with your own market estimate." },
  captureRate: { label: "Share of those customers who contact a recommended business", value: 0.08, note: "Placeholder assumption." },
  avgCustomerValue: { label: "Average value of one new customer (USD)", value: 250, note: "Placeholder assumption; use your own average ticket or lifetime value." },
};

function buildCostOfInaction(mentionRate: number, measured: boolean): CostOfInaction {
  const a = COST_ASSUMPTIONS;
  const missed = measured ? a.monthlyAiQueries.value * (1 - mentionRate) : a.monthlyAiQueries.value;
  const lostCustomers = missed * a.captureRate.value;
  const monthly = lostCustomers * a.avgCustomerValue.value;
  return {
    label: "estimate",
    assumptions: Object.entries(a).map(([key, v]) => ({ key, label: v.label, value: v.value, note: v.note })),
    mentionRate,
    missedDiscoveriesPerMonth: Math.round(missed),
    estimatedLostCustomersPerMonth: Math.round(lostCustomers * 10) / 10,
    estimatedLostRevenuePerMonth: Math.round(monthly),
    estimatedLostRevenuePerYear: Math.round(monthly * 12),
    formula: "monthly AI queries × (1 − measured mention rate) × capture rate × average customer value",
  };
}

function buildVerdict(ctx: { name: string; grade: string; score: number; mentionRate: number; mentionedRuns: number; completed: number; liveEngines: number; top: { name: string; runCount: number } | null; criticalFailures: CriticalFailure[] }): string {
  const parts: string[] = [];
  if (ctx.completed === 0) {
    parts.push(`No AI engine ${ctx.liveEngines === 0 ? "could be queried" : "returned an answer"}, so ${ctx.name}'s visibility is unmeasured and the score reflects website signals only.`);
  } else if (ctx.mentionedRuns === 0) {
    parts.push(`Right now AI engines do not recommend ${ctx.name} at all: across ${ctx.completed} answers on ${ctx.liveEngines} engine${ctx.liveEngines === 1 ? "" : "s"}, it was never mentioned.`);
  } else {
    parts.push(`${ctx.name} appears in ${pct(ctx.mentionRate)} of the answers a customer would get from AI (${ctx.mentionedRuns} of ${ctx.completed}).`);
  }
  if (ctx.top && ctx.top.runCount > ctx.mentionedRuns) parts.push(`Engines point customers to ${ctx.top.name} instead (${ctx.top.runCount} mentions).`);
  const lead = ctx.criticalFailures[0];
  if (lead && !["invisible", "mostly_invisible", "outranked", "no_live_engines"].includes(lead.key)) parts.push(lead.detail);
  parts.push(`Overall grade: ${ctx.grade} (${ctx.score}/100).`);
  return parts.join(" ");
}
