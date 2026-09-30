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
  mentioned: boolean;
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
    const optional = optionalAllowed && GENERIC_TOKENS.has(token);
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
const CLAUSE_BREAK = /, |; |—|–/g;

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

/**
 * The clause naming the business, within its sentence. A caveat in a later clause ("..., though I don't have
 * information about its pricing") does not taint the mention. When the name only introduces its clause
 * ("As for X, ..." / "X — ..."), the statement about it is the next clause, so that one is included too.
 */
function clauseAround(answer: string, match: MentionMatch): string {
  const sentences = splitSpans(answer, { start: 0, end: answer.length }, SENTENCE_BREAK);
  const sentence = {
    start: sentences[spanIndexAt(sentences, match.start)].start,
    end: sentences[spanIndexAt(sentences, match.end - 1)].end,
  };
  const clauses = splitSpans(answer, sentence, CLAUSE_BREAK);
  const first = spanIndexAt(clauses, match.start);
  let last = spanIndexAt(clauses, match.end - 1);
  if (last + 1 < clauses.length && !/[\p{L}\p{N}]/u.test(answer.slice(match.end, clauses[last].end))) last += 1;
  return answer.slice(clauses[first].start, clauses[last].end);
}

/** True when the clause naming the business only says the engine has no information about it. */
export function isEchoOnly(answer: string, match: MentionMatch): boolean {
  const clause = clauseAround(answer, match);
  return NO_INFO_PATTERNS.some((p) => p.test(clause));
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

/** Strict: only `true` or the string "true" count, since Boolean("false") is true. */
function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return typeof value === "string" && value.trim().toLowerCase() === "true";
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
            isTarget: parseBoolean(b.isTarget),
          }))
          .filter((b) => b.name.length > 0)
      : [];
    const sentiment = SENTIMENTS.has(String(raw.sentiment)) ? (raw.sentiment as ClassifierOutput["sentiment"]) : "not_applicable";
    const accuracy = ACCURACIES.has(String(raw.accuracy)) ? (raw.accuracy as ClassifierOutput["accuracy"]) : "not_applicable";
    return {
      mentioned: parseBoolean(raw.mentioned),
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
  if (!classifier) {
    mentioned = deterministic.mentioned;
  } else if (classifier.mentioned) {
    // The deterministic echo guard yields only to a corroborated classifier; a bare "mentioned: true" cannot lift it.
    mentioned = !deterministic.echoOnly || targetListed;
  } else {
    // A classifier "not mentioned" vetoes the text match when its structure agrees: it flagged a namesake (ambiguity)
    // or left the target out of the businesses list. Inconsistent output (target listed, no ambiguity) trusts the text.
    mentioned = deterministic.mentioned && classifier.ambiguity === null && targetListed;
  }
  return {
    ...deterministic,
    mentioned,
    mentionPosition: mentioned ? (mentionPosition ?? deterministic.listRank) : null,
    sentiment: classifier ? (mentioned ? classifier.sentiment : "not_applicable") : null,
    accuracy: classifier ? (mentioned ? classifier.accuracy : "not_applicable") : null,
    accuracyNotes: classifier?.accuracyNotes || null,
    ambiguity: classifier?.ambiguity ?? null,
    competitors,
    classifierUsed: classifier !== null,
  };
}
