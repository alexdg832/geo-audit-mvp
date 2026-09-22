import {
  CategoryScores,
  ConsistencyResult,
  AiVisibilityResult,
  MockMention,
  WebsiteCheckResult,
} from "./types";

export const CATEGORY_MAX = {
  sourceTrust: 35,
  consistency: 25,
  aiReadiness: 25,
  aiVisibility: 15,
};

const WEBSITE_WEIGHTS = {
  https: 2,
  titleAndMeta: 4,
  schemaOrg: 6,
  aboutAndContact: 6,
  aiCrawlerAccess: 5,
  llmsTxt: 2,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function scoreSourceTrust(mentions: MockMention[]): number {
  if (mentions.length === 0) return 0;
  const weighted = mentions.reduce((sum, m) => {
    if (m.tier === 1) return sum + 1;
    if (m.tier === 2) return sum + 0.5;
    return sum - 0.5; // tier 3 counts against the score
  }, 0);
  return Math.round(clamp01(weighted / mentions.length) * CATEGORY_MAX.sourceTrust);
}

export function scoreConsistency(consistency: ConsistencyResult): number {
  return Math.round(clamp01(consistency.consistencyRatio) * CATEGORY_MAX.consistency);
}

export function scoreAiReadiness(checks: WebsiteCheckResult): number {
  if (!checks.urlProvided || !checks.fetchOk) return 0;

  let points = 0;
  if (checks.https) points += WEBSITE_WEIGHTS.https;

  const titleAndMetaCount = [checks.title, checks.metaDescription].filter(Boolean).length;
  points += (titleAndMetaCount / 2) * WEBSITE_WEIGHTS.titleAndMeta;

  if (checks.hasSchemaOrg) points += WEBSITE_WEIGHTS.schemaOrg;

  const aboutAndContactCount = [checks.hasAboutPage, checks.hasVisibleContactInfo].filter(
    Boolean
  ).length;
  points += (aboutAndContactCount / 2) * WEBSITE_WEIGHTS.aboutAndContact;

  const crawlerFlags = [
    checks.robots.gptBotAllowed,
    checks.robots.claudeBotAllowed,
    checks.robots.perplexityBotAllowed,
  ];
  const allowedCount = crawlerFlags.filter(Boolean).length;
  points += (allowedCount / crawlerFlags.length) * WEBSITE_WEIGHTS.aiCrawlerAccess;

  if (checks.hasLlmsTxt) points += WEBSITE_WEIGHTS.llmsTxt;

  return Math.round(points);
}

export function scoreAiVisibility(visibility: AiVisibilityResult): number {
  const factor = visibility.isMentioned ? visibility.confidence : visibility.confidence * 0.3;
  return Math.round(clamp01(factor) * CATEGORY_MAX.aiVisibility);
}

export function computeCategoryScores(input: {
  mentions: MockMention[];
  consistency: ConsistencyResult;
  websiteChecks: WebsiteCheckResult;
  aiVisibility: AiVisibilityResult;
}): CategoryScores {
  return {
    sourceTrust: scoreSourceTrust(input.mentions),
    consistency: scoreConsistency(input.consistency),
    aiReadiness: scoreAiReadiness(input.websiteChecks),
    aiVisibility: scoreAiVisibility(input.aiVisibility),
  };
}

export function totalScore(categories: CategoryScores): number {
  return Math.round(
    categories.sourceTrust +
      categories.consistency +
      categories.aiReadiness +
      categories.aiVisibility
  );
}

export function gradeForScore(score: number): { label: string; tone: "bad" | "mid" | "good" } {
  if (score >= 75) return { label: "Strong", tone: "good" };
  if (score >= 50) return { label: "Getting There", tone: "mid" };
  return { label: "Needs Work", tone: "bad" };
}
