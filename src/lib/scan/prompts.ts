export type PromptKind = "recommendation" | "near_me" | "comparison" | "brand_direct";

export interface GeneratedPrompt {
  index: number;
  kind: PromptKind;
  text: string;
}

export interface PromptInput {
  name: string;
  category: string | null;
  location: string | null;
}

const KIND_LABELS: Record<PromptKind, string> = {
  recommendation: "Recommendation",
  near_me: "Near me",
  comparison: "Comparison",
  brand_direct: "Direct brand",
};

export function promptKindLabel(kind: PromptKind): string {
  return KIND_LABELS[kind];
}

/**
 * Builds the fixed, ordered prompt set for a scan. The set is deterministic for
 * the same inputs so a scan can be reproduced and compared over time.
 */
export function generatePrompts(input: PromptInput): GeneratedPrompt[] {
  const name = input.name.trim();
  const category = (input.category ?? "").trim().toLowerCase() || null;
  const location = (input.location ?? "").trim() || null;

  const what = category ?? "business";
  const plural = category ? pluralize(category) : "businesses";
  const inLoc = location ? ` in ${location}` : "";
  const nearLoc = location ? ` near ${location}` : " near me";

  const texts: { kind: PromptKind; text: string }[] = [
    { kind: "recommendation", text: `What are the best ${plural}${inLoc}? Please name specific businesses and explain why.` },
    { kind: "recommendation", text: `Can you recommend a good ${what}${inLoc}? I want specific names, not general advice.` },
    { kind: "near_me", text: `I'm looking for a ${what}${nearLoc}. Which ones should I consider, and what are they known for?` },
    { kind: "comparison", text: `Compare the top ${plural}${inLoc}. Which one would you choose and why?` },
    { kind: "brand_direct", text: `What do you know about ${name}${inLoc}? Is it a ${what} worth going to?` },
    { kind: "brand_direct", text: `What are people saying about ${name}${inLoc}? Summarise reviews and reputation.` },
  ];

  return texts.map((t, index) => ({ index, ...t }));
}

function pluralize(noun: string): string {
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}
