import { SeededRandom } from "../seed";
import { AiSnippetPart } from "../types";

/**
 * TODO(real integration): replace with an actual captured response from an
 * AI assistant, with claims cross-checked against the Truth Brief instead
 * of templated inaccuracies.
 */

const INACCURACIES = [
  (name: string) => `Some sources say ${name} closed last year, though that appears to be out of date.`,
  (name: string) => `${name} is sometimes confused with a similarly named business in another city.`,
  (name: string) => `A few listings show an old phone number for ${name} that's no longer in service.`,
  (name: string) => `${name}'s address is listed inconsistently across a couple of directories.`,
];

export function generateMockAiSnippet(
  businessName: string,
  location: string | null,
  isMentioned: boolean
): AiSnippetPart[] {
  const rng = new SeededRandom(`aisnippet:${businessName}:${location ?? ""}`);

  if (!isMentioned) {
    return [
      {
        text: `I don't have reliable information about ${businessName}${
          location ? ` in ${location}` : ""
        }.`,
        accurate: true,
      },
    ];
  }

  const parts: AiSnippetPart[] = [
    {
      text: `${businessName} is a business${location ? ` based in ${location}` : ""}. `,
      accurate: true,
    },
  ];

  const inaccuracyCount = rng.int(1, 2);
  const chosen = rng.pickMany(INACCURACIES, inaccuracyCount);
  for (const template of chosen) {
    parts.push({ text: template(businessName) + " ", accurate: false });
  }

  parts.push({
    text: "Overall reputation appears generally positive based on available sources.",
    accurate: true,
  });

  return parts;
}
