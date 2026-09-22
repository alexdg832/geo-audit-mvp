import { CATEGORY_MAX } from "./score";
import {
  CategoryScores,
  ConsistencyResult,
  MockMention,
  WebsiteCheckResult,
} from "./types";

interface RecommendationInput {
  categories: CategoryScores;
  websiteChecks: WebsiteCheckResult;
  mentions: MockMention[];
  consistency: ConsistencyResult;
}

/** Builds one plain-language recommendation per weak category, ranked by how far it is from full marks. */
export function buildRecommendations(input: RecommendationInput): string[] {
  const candidates: { gap: number; text: string }[] = [];

  const tier3Count = input.mentions.filter((m) => m.tier === 3).length;
  candidates.push({
    gap: CATEGORY_MAX.sourceTrust - input.categories.sourceTrust,
    text:
      tier3Count > 0
        ? `Build up authoritative sources (Google Business Profile, BBB, industry directories) to outweigh the ${tier3Count} low-trust mention${tier3Count === 1 ? "" : "s"} currently shaping your story.`
        : "Keep adding authoritative sources (BBB, industry associations, local press) so AI has more high-trust material to draw from.",
  });

  candidates.push({
    gap: CATEGORY_MAX.consistency - input.categories.consistency,
    text:
      input.consistency.issues.length > 0
        ? `Fix inconsistent business details across listings: ${input.consistency.issues[0]}`
        : "Double-check your name, address, and phone number match exactly across every listing.",
  });

  const readinessFixes: string[] = [];
  if (!input.websiteChecks.urlProvided) {
    readinessFixes.push("Add a website — AI assistants need something to read.");
  } else {
    if (!input.websiteChecks.hasSchemaOrg) {
      readinessFixes.push("Add Organization/LocalBusiness schema markup so AI crawlers can parse your business details directly.");
    }
    if (!input.websiteChecks.robots.gptBotAllowed || !input.websiteChecks.robots.claudeBotAllowed) {
      readinessFixes.push("Update robots.txt to allow GPTBot and ClaudeBot — right now some AI crawlers may be blocked.");
    }
    if (!input.websiteChecks.hasLlmsTxt) {
      readinessFixes.push("Add an llms.txt file summarizing your business for AI systems.");
    }
    if (!input.websiteChecks.hasVisibleContactInfo || !input.websiteChecks.hasAboutPage) {
      readinessFixes.push("Add a clear About page with visible name, address, and phone number.");
    }
  }
  candidates.push({
    gap: CATEGORY_MAX.aiReadiness - input.categories.aiReadiness,
    text: readinessFixes[0] ?? "Your website is already well set up for AI readability — keep it current.",
  });

  candidates.push({
    gap: CATEGORY_MAX.aiVisibility - input.categories.aiVisibility,
    text: "Publish more content (press mentions, knowledge profiles, Q&A pages) that AI assistants are likely to cite when asked about you.",
  });

  return candidates
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map((c) => c.text);
}
