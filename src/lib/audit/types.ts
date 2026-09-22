export type StepKey =
  | "website"
  | "mentions"
  | "sourceTrust"
  | "aiReadiness"
  | "score";

export interface AuditStep {
  key: StepKey;
  label: string;
  status: "pending" | "in_progress" | "done";
}

export interface WebsiteCheckResult {
  urlProvided: boolean;
  url: string | null;
  fetchOk: boolean;
  fetchError: string | null;
  https: boolean;
  title: string | null;
  metaDescription: string | null;
  hasSchemaOrg: boolean;
  schemaType: string | null;
  hasAboutPage: boolean;
  hasVisibleContactInfo: boolean;
  detectedPhone: string | null;
  detectedAddressHint: string | null;
  robots: {
    checked: boolean;
    gptBotAllowed: boolean;
    claudeBotAllowed: boolean;
    perplexityBotAllowed: boolean;
  };
  hasLlmsTxt: boolean;
}

export type SourceTier = 1 | 2 | 3;

export interface MockMention {
  name: string;
  url: string | null;
  tier: SourceTier;
  snippet: string;
  accurate: boolean;
}

export interface AiSnippetPart {
  text: string;
  accurate: boolean;
}

export interface AiVisibilityResult {
  isMentioned: boolean;
  confidence: number; // 0-1
  note: string;
}

export interface ConsistencyResult {
  consistencyRatio: number; // 0-1
  issues: string[];
}

export interface CategoryScores {
  sourceTrust: number;
  consistency: number;
  aiReadiness: number;
  aiVisibility: number;
}

export interface AuditResult {
  score: number;
  categories: CategoryScores;
  websiteChecks: WebsiteCheckResult;
  mentions: MockMention[];
  consistency: ConsistencyResult;
  aiVisibility: AiVisibilityResult;
  aiSnippet: AiSnippetPart[];
  recommendations: string[];
}
