import { SeededRandom } from "../seed";
import { AiVisibilityResult } from "../types";

/**
 * TODO(real integration): replace with real prompts sent to AI assistants
 * (ChatGPT/Claude/Perplexity APIs) asking "what do you know about
 * {businessName}?", then classify the response for presence and accuracy.
 */

export function generateMockAiVisibility(businessName: string): AiVisibilityResult {
  const rng = new SeededRandom(`aivisibility:${businessName}`);
  const isMentioned = rng.bool(0.7);
  const confidence = isMentioned ? rng.float(0.4, 0.95) : rng.float(0.0, 0.3);

  const note = isMentioned
    ? confidence > 0.7
      ? "AI assistants recognize this business and mostly get the details right."
      : "AI assistants mention this business but some details are shaky or outdated."
    : "AI assistants rarely surface this business when asked directly — it has little presence in the sources they draw from.";

  return { isMentioned, confidence, note };
}
