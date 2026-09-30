// Types of the pre-scan-engine audit format; still used to render legacy audits.

export type StepKey = "website" | "mentions" | "sourceTrust" | "aiReadiness" | "score";

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

export interface AiSnippetPart {
  text: string;
  accurate: boolean;
}
