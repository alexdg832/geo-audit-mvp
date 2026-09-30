export interface MentionMatch {
  start: number;
  end: number;
  text: string;
}

export interface DeterministicAnalysis {
  mentioned: boolean;
  /** The name appears only inside "I could not find information about X" style sentences. */
  echoOnly: boolean;
  mentionCount: number;
  mentionStart: number | null;
  mentionEnd: number | null;
  /** 1-based position of the first mention among list items, when the answer is a list. */
  listRank: number | null;
  listItemCount: number | null;
}

export interface ClassifierBusiness {
  name: string;
  domain: string | null;
  isTarget: boolean;
}

export interface ClassifierOutput {
  /** null when the classifier gave no usable verdict (key missing or not a boolean); the text match then stands. */
  mentioned: boolean | null;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "not_applicable";
  accuracy: "accurate" | "inaccurate" | "unverifiable" | "not_applicable";
  accuracyNotes: string;
  /** Set when the answer appears to describe a different business with the same or a similar name. */
  ambiguity: string | null;
  businesses: ClassifierBusiness[];
}

export interface AnswerAnalysis extends DeterministicAnalysis {
  mentionPosition: number | null;
  sentiment: ClassifierOutput["sentiment"] | null;
  accuracy: ClassifierOutput["accuracy"] | null;
  accuracyNotes: string | null;
  ambiguity: string | null;
  competitors: { name: string; domain: string | null; position: number }[];
  classifierUsed: boolean;
}

// Trailing position only: "PC Repair Shop" and "Co-op Market" keep their first word, "Smith DDS, PC" loses both suffixes.
const LEGAL_SUFFIXES =
  /(?:[^\p{L}\p{N}]+(?:llc|l\.l\.c\.?|inc\.?|incorporated|ltd\.?|limited|co\.?|corp\.?|corporation|pllc|p\.c\.?|pc|dds|d\.d\.s\.?|md|m\.d\.?|pa|p\.a\.?|lp|llp|gmbh|plc))+[^\p{L}\p{N}]*$/iu;

const ARTICLES = new Set(["the", "a", "an"]);

const GENERIC_TOKENS = new Set([
  "the", "of", "and", "a", "an", "at", "in", "for", "family", "group", "associates", "center", "centre", "clinic",
  "studio", "co", "company", "services", "service", "shop", "store", "office", "practice", "team", "partners",
]);

export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SEP = "[^\\p{L}\\p{N}]{1,4}";

/** Builds a tolerant matcher: tokens in order, generic tokens optional, punctuation between tokens allowed. */
export function buildMentionRegex(name: string): RegExp | null {
  const tokens = normalizeBusinessName(name).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  const significant = tokens.filter((t) => !GENERIC_TOKENS.has(t));
  // Generic words become optional only when at least two distinctive words remain to anchor the match. With one
  // ("Family Dental Center" → "dental") the regex would count every use of the category word as a mention.
  const optionalAllowed = significant.length >= 2 && significant.length < tokens.length;

  let pattern = "";
  let pendingOptional = "";
  let emittedRequired = 0;
  tokens.forEach((token, i) => {
    const core = `${escapeRegex(token)}(?:'s)?`;
    // A leading article never anchors anything ("The Pizza Company" is written "Pizza Company"), so it is optional
    // even when only one distinctive word remains: the generic word after it is still required.
    const optional = (optionalAllowed && GENERIC_TOKENS.has(token)) || (i === 0 && tokens.length > 1 && ARTICLES.has(token));
    const isLast = i === tokens.length - 1;
    if (optional) {
      if (isLast) pattern += `(?:${SEP}${core})?`;
      else pendingOptional += `(?:${core}${SEP})?`;
      return;
    }
    if (emittedRequired > 0) pattern += SEP;
    pattern += pendingOptional + core;
    pendingOptional = "";
    emittedRequired += 1;
  });
  if (emittedRequired === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, "giu");
}

export function findMentions(answer: string, name: string, domain: string | null): MentionMatch[] {
  const matches: MentionMatch[] = [];
  const regex = buildMentionRegex(name);
  if (regex) {
    for (const m of answer.matchAll(regex)) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  if (domain) {
    const domainRegex = new RegExp(`(?<![\\p{L}\\p{N}])(?:www\\.)?${escapeRegex(domain)}(?![\\p{L}\\p{N}])`, "giu");
    for (const m of answer.matchAll(domainRegex)) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

const LIST_LINE = /^(\s*)(?:[-*•]|\d{1,2}[.)])\s+/;

function listRankOf(answer: string, index: number): { rank: number | null; count: number | null } {
  const lines = answer.split("\n");
  let offset = 0;
  let listCount = 0;
  let rank: number | null = null;
  let baseIndent: number | null = null;
  for (const line of lines) {
    const item = LIST_LINE.exec(line);
    // Only items at the outermost indentation count; deeper bullets are details of the item above them.
    if (item) baseIndent ??= item[1].length;
    const isItem = item !== null && item[1].length <= (baseIndent ?? 0);
    if (isItem) listCount += 1;
    const end = offset + line.length;
    if (isItem && rank === null && index >= offset && index <= end) rank = listCount;
    offset = end + 1;
  }
  return { rank, count: listCount > 0 ? listCount : null };
}

const NO_INFO_PATTERNS = [
  // No bare "no" here: "no long-term contracts, and its reviews are excellent" is a recommendation, not an echo.
  // The last pattern covers the "no information" form directly.
  /\b(?:could(?:n'?t| not)|can(?:'t|not)|unable to|(?:wasn'?t|was not) able to|(?:don'?t|do not|doesn'?t|does not) (?:have|find|know))\b[^.\n]{0,80}\b(?:information|details|data|records?|results?|listings?|presence|reviews)\b/i,
  /\bnot (?:aware|familiar) (?:of|with)\b/i,
  /\b(?:no|little|limited) (?:reliable |specific |public |verified |available )?(?:information|details|data)\b/i,
];

interface Span {
  start: number;
  end: number;
}

const SENTENCE_BREAK = /\. |\n|! |\? /g;

function splitSpans(answer: string, window: Span, breaks: RegExp): Span[] {
  const spans: Span[] = [];
  let start = window.start;
  for (const m of answer.slice(window.start, window.end).matchAll(breaks)) {
    const at = window.start + m.index;
    spans.push({ start, end: at });
    start = at + m[0].length;
  }
  spans.push({ start, end: window.end });
  return spans;
}

function spanIndexAt(spans: Span[], index: number): number {
  const i = spans.findIndex((s) => index < s.end);
  return i === -1 ? spans.length - 1 : i;
}

/** The sentence naming the business (a list item counts as its own sentence). */
function sentenceAround(answer: string, match: MentionMatch): string {
  const sentences = splitSpans(answer, { start: 0, end: answer.length }, SENTENCE_BREAK);
  const start = sentences[spanIndexAt(sentences, match.start)].start;
  const end = sentences[spanIndexAt(sentences, match.end - 1)].end;
  return answer.slice(start, end);
}

/** "No information about its pricing" is a caveat about one attribute of a business the answer does describe. */
const ATTRIBUTE_CAVEAT =
  /\b(?:about|on|regarding|of|for)\s+(?:its|their|the(?:ir)?|specific|current|exact)\s+(?:pric\w*|rates?|fees?|costs?|hours|schedule|menu|reviews?|ratings?|services?|classes|instructors?|address|location|website|phone|contact)\b/i;

/**
 * True when the sentence naming the business says the engine has no information about it. The whole sentence is
 * checked rather than one clause, because the caveat sits before or after the name freely ("X in Rancho, but I
 * couldn't find details"); an over-reported mention is the costlier mistake for an audit. A caveat about a single
 * attribute of an otherwise described business is not an echo.
 */
export function isEchoOnly(answer: string, match: MentionMatch): boolean {
  const sentence = sentenceAround(answer, match);
  for (const pattern of NO_INFO_PATTERNS) {
    const m = pattern.exec(sentence);
    if (!m) continue;
    if (ATTRIBUTE_CAVEAT.test(sentence.slice(m.index, m.index + m[0].length + 60))) continue;
    return true;
  }
  return false;
}

export function analyzeDeterministic(answer: string, name: string, domain: string | null): DeterministicAnalysis {
  const all = findMentions(answer, name, domain);
  const mentions = all.filter((m) => !isEchoOnly(answer, m));
  const first = mentions[0] ?? null;
  const list = first ? listRankOf(answer, first.start) : { rank: null, count: null };
  return {
    mentioned: mentions.length > 0,
    echoOnly: all.length > 0 && mentions.length === 0,
    mentionCount: mentions.length,
    mentionStart: first?.start ?? null,
    mentionEnd: first?.end ?? null,
    listRank: list.rank,
    listItemCount: list.count ?? listRankOf(answer, 0).count,
  };
}

export interface ClassifierInput {
  answer: string;
  businessName: string;
  businessDomain: string | null;
  location: string | null;
  category: string | null;
  knownFacts: string[];
}

export function buildClassifierPrompt(input: ClassifierInput): { system: string; user: string } {
  const facts = input.knownFacts.length ? input.knownFacts.map((f) => `- ${f}`).join("\n") : "- (no verified facts available)";
  return {
    system:
      "You analyse an AI assistant's answer about local businesses. Be literal and conservative: never infer a mention that is not in the text, and never guess facts. Respond with a single JSON object and nothing else.",
    user: `TARGET BUSINESS: ${input.businessName}${input.businessDomain ? ` (website: ${input.businessDomain})` : ""}${input.location ? `, located in ${input.location}` : ""}${input.category ? `, category: ${input.category}` : ""}

VERIFIED FACTS ABOUT THE TARGET (from its own website or owner):
${facts}

AI ANSWER TO ANALYSE:
<<<
${input.answer}
>>>

Return JSON with exactly these keys:
{
  "mentioned": boolean — true only if the answer actually recommends, describes or gives information about the target business itself (not a similarly named one elsewhere). False when the answer merely repeats the name from the question, or says it has no or unreliable information about it,
  "sentiment": "positive" | "neutral" | "negative" | "mixed" | "not_applicable" — tone of what the answer says about the target; not_applicable when not mentioned,
  "accuracy": "accurate" | "inaccurate" | "unverifiable" | "not_applicable" — whether the answer's specific claims about the target agree with the verified facts; unverifiable when it makes claims the facts cannot confirm; not_applicable when not mentioned,
  "accuracyNotes": string — quote each claim about the target that conflicts with the facts, or "" if none,
  "ambiguity": string | null — if the answer describes a different business that shares the target's name or a very similar one (another city, another category, a chain with the same name), say which in one sentence; otherwise null,
  "businesses": [ { "name": string, "domain": string | null, "isTarget": boolean } ] — every distinct business the answer recommends or names, in order of first appearance; mark the target with isTarget true. Exclude generic categories, cities, and platforms such as Yelp or Google.
}`,
  };
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

const SENTIMENTS = new Set(["positive", "neutral", "negative", "mixed", "not_applicable"]);
const ACCURACIES = new Set(["accurate", "inaccurate", "unverifiable", "not_applicable"]);

/**
 * Booleans as a model actually writes them: true/false, "true"/"false", "yes"/"no". Anything else (missing key,
 * a sentence) is null, i.e. no verdict, so it can never be mistaken for a deliberate "false". Boolean("false") is true.
 */
function parseTriState(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "yes") return true;
  if (v === "false" || v === "no") return false;
  return null;
}

export function parseClassifierOutput(text: string): ClassifierOutput | null {
  const json = extractJson(text);
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const businesses = Array.isArray(raw.businesses)
      ? raw.businesses
          .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
          .map((b) => ({
            name: String(b.name ?? "").trim(),
            domain: typeof b.domain === "string" && b.domain.trim() ? b.domain.trim().toLowerCase().replace(/^www\./, "") : null,
            isTarget: parseTriState(b.isTarget) === true,
          }))
          .filter((b) => b.name.length > 0)
      : [];
    const sentiment = SENTIMENTS.has(String(raw.sentiment)) ? (raw.sentiment as ClassifierOutput["sentiment"]) : "not_applicable";
    const accuracy = ACCURACIES.has(String(raw.accuracy)) ? (raw.accuracy as ClassifierOutput["accuracy"]) : "not_applicable";
    return {
      mentioned: parseTriState(raw.mentioned),
      sentiment,
      accuracy,
      accuracyNotes: typeof raw.accuracyNotes === "string" ? raw.accuracyNotes.trim() : "",
      ambiguity: typeof raw.ambiguity === "string" && raw.ambiguity.trim() ? raw.ambiguity.trim().slice(0, 300) : null,
      businesses,
    };
  } catch {
    return null;
  }
}

export function normalizeCompetitorName(name: string): string {
  return normalizeBusinessName(name);
}

/** Combines the deterministic text match with the classifier's reading. Spans always come from the text match. */
export function mergeAnalysis(
  deterministic: DeterministicAnalysis,
  classifier: ClassifierOutput | null,
  businessName: string
): AnswerAnalysis {
  const targetNorm = normalizeBusinessName(businessName);
  const businesses = (classifier?.businesses ?? []).map((b) => ({
    ...b,
    isTarget: b.isTarget || normalizeCompetitorName(b.name) === targetNorm,
  }));
  const seen = new Set<string>();
  const competitors: AnswerAnalysis["competitors"] = [];
  let position = 1;
  let mentionPosition: number | null = null;
  for (const b of businesses) {
    if (b.isTarget) {
      if (mentionPosition === null) mentionPosition = position;
      position += 1;
      continue;
    }
    const key = normalizeCompetitorName(b.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    competitors.push({ name: b.name, domain: b.domain, position });
    position += 1;
  }

  // The classifier listed the target among the businesses the answer names: structured corroboration of its verdict.
  const targetListed = mentionPosition !== null;
  let mentioned: boolean;
  if (!classifier || classifier.mentioned === null) {
    // No classifier, or one that gave no usable verdict: the text match stands.
    mentioned = deterministic.mentioned;
  } else if (classifier.mentioned) {
    // The deterministic echo guard yields only to a corroborated classifier; a bare "mentioned: true" cannot lift it.
    mentioned = !deterministic.echoOnly || targetListed;
  } else {
    // An explicit "not mentioned" vetoes the text match when its structure agrees: it flagged a namesake (ambiguity)
    // or left the target out of the businesses list. Inconsistent output (target listed, no ambiguity) trusts the text.
    mentioned = deterministic.mentioned && classifier.ambiguity === null && targetListed;
  }
  return {
    ...deterministic,
    mentioned,
    // A vetoed match keeps no span: mentioned=false always means "nothing to highlight".
    mentionCount: mentioned ? deterministic.mentionCount : 0,
    mentionStart: mentioned ? deterministic.mentionStart : null,
    mentionEnd: mentioned ? deterministic.mentionEnd : null,
    mentionPosition: mentioned ? (mentionPosition ?? deterministic.listRank) : null,
    sentiment: classifier ? (mentioned ? classifier.sentiment : "not_applicable") : null,
    accuracy: classifier ? (mentioned ? classifier.accuracy : "not_applicable") : null,
    accuracyNotes: classifier?.accuracyNotes || null,
    ambiguity: classifier?.ambiguity ?? null,
    competitors,
    classifierUsed: classifier !== null,
  };
}
