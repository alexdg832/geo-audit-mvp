/**
 * Pure report view-model types and formatting helpers.
 *
 * This module has no database import so client components can use it. Anything that needs
 * Prisma lives in ./load.ts, which is server-only via @/lib/db.
 */
import type { PromptKind } from "@/lib/scan/prompts";
import type { SiteScanResult } from "@/lib/scan/siteScan";
import type { CapApplied, CostOfInaction, CriticalFailure, RoadmapItem } from "@/lib/scoring/types";

export interface CitationView {
  id: string;
  index: number;
  url: string;
  domain: string;
  title: string | null;
  tier: 1 | 2 | 3 | 4;
  tierReason: string | null;
  isBusinessOwned: boolean;
  passageStart: number | null;
  passageEnd: number | null;
  passageText: string | null;
  citedText: string | null;
}

export interface RunView {
  id: string;
  engine: string;
  engineLabel: string;
  model: string | null;
  promptId: string;
  promptIndex: number;
  promptKind: PromptKind;
  promptText: string;
  runIndex: number;
  status: string;
  answerText: string | null;
  latencyMs: number | null;
  cached: boolean;
  noCitations: boolean;
  error: string | null;
  mentioned: boolean | null;
  mentionPosition: number | null;
  mentionStart: number | null;
  mentionEnd: number | null;
  sentiment: string | null;
  accuracy: string | null;
  accuracyNotes: string | null;
  competitors: { name: string; domain: string | null; position: number }[];
  completedAt: string | null;
  citations: CitationView[];
}

export interface BreakdownView {
  id: string;
  pillar: string;
  metric: string;
  label: string;
  weight: number;
  value: number;
  points: number;
  pointsLost: number;
  confidence: string;
  finding: string;
  evidence: { runIds?: string[]; citationIds?: string[]; siteCheckFields?: string[]; competitorIds?: string[]; note?: string };
  order: number;
}

export interface ReportData {
  audit: {
    id: string;
    businessId: string;
    businessName: string;
    website: string | null;
    domain: string | null;
    location: string | null;
    category: string | null;
    ambiguity: string | null;
    createdAt: string;
    completedAt: string | null;
    isMock: boolean;
    scanVersion: string;
    scoringVersion: string | null;
    status: string;
    runsPerPrompt: number;
  };
  report: {
    score: number;
    grade: string;
    confidence: string;
    verdict: string;
    pillars: { key: string; label: string; weight: number; score: number; confidence: string }[];
    caps: CapApplied[];
    criticalFailures: CriticalFailure[];
    roadmap: RoadmapItem[];
    costOfInaction: CostOfInaction | null;
    generatedAt: string;
  };
  breakdowns: BreakdownView[];
  engines: { engine: string; label: string; status: string; model: string | null; callsMade: number; error: string | null }[];
  prompts: { id: string; index: number; kind: PromptKind; text: string }[];
  runs: RunView[];
  competitors: { id: string; name: string; domain: string | null; mentionCount: number; runCount: number; engines: string[]; evidenceRunIds: string[] }[];
  site: SiteScanResult | null;
  hasAccount: boolean;
}

/** Only http(s) links are rendered as anchors; engine output can contain anything. */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** One source in an answer, with every citation row that points at it. */
export interface CitationGroup {
  /** 0-based position in the answer's source list; superscripts show index + 1. */
  index: number;
  url: string;
  domain: string;
  title: string | null;
  tier: 1 | 2 | 3 | 4;
  tierReason: string | null;
  isBusinessOwned: boolean;
  citations: CitationView[];
}

/**
 * Groups an answer's citation rows by URL, in order of first appearance. Engines emit one row per
 * inline marker (Perplexity writes "[1]" after every sentence it supports), so without grouping one
 * page would be listed and numbered once per sentence.
 */
export function groupCitationsByUrl(citations: CitationView[]): CitationGroup[] {
  const groups = new Map<string, CitationGroup>();
  for (const c of citations) {
    const group = groups.get(c.url);
    if (group) {
      group.citations.push(c);
      if (!group.title && c.title) group.title = c.title;
    } else {
      groups.set(c.url, {
        index: groups.size,
        url: c.url,
        domain: c.domain,
        title: c.title,
        tier: c.tier,
        tierReason: c.tierReason,
        isBusinessOwned: c.isBusinessOwned,
        citations: [c],
      });
    }
  }
  return Array.from(groups.values());
}

/** One cited URL across the whole audit. */
export interface SourceView extends CitationView {
  /** True when at least one answer that mentions the business cites this URL. */
  mentioned: boolean;
  /** Labels of the engines whose answers cite this URL. */
  engines: string[];
  /** Citation rows behind this URL across all answers. */
  rowCount: number;
}

/** Distinct URLs across all runs, so source totals count pages rather than citation rows. */
export function distinctSources(runs: RunView[]): SourceView[] {
  const byUrl = new Map<string, SourceView>();
  for (const run of runs) {
    for (const c of run.citations) {
      const existing = byUrl.get(c.url);
      if (existing) {
        existing.rowCount += 1;
        if (run.mentioned) existing.mentioned = true;
        if (!existing.engines.includes(run.engineLabel)) existing.engines.push(run.engineLabel);
        if (!existing.title && c.title) existing.title = c.title;
      } else {
        byUrl.set(c.url, { ...c, mentioned: Boolean(run.mentioned), engines: [run.engineLabel], rowCount: 1 });
      }
    }
  }
  return Array.from(byUrl.values());
}

// Code points above U+00FF that the built-in Helvetica font can draw; mirrors pdfkit's WIN_ANSI_MAP.
const WIN_ANSI_EXTRA = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6, 0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
]);

// ASCII stand-ins for characters engines commonly emit that WinAnsi lacks.
const PDF_REPLACEMENTS: Record<string, string> = {
  "−": "-", // minus sign
  "‐": "-",
  "‑": "-",
  "←": "<-",
  "→": "->",
  "↔": "<->",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "≈": "~",
  "★": "*",
  "☆": "*",
  "✓": "[ok]",
  "✔": "[ok]",
  "✅": "[ok]",
  "✗": "[x]",
  "✘": "[x]",
  "❌": "[x]",
  "​": "",
  "‌": "",
  "‍": "",
  "﻿": "",
};

function isWinAnsi(codePoint: number): boolean {
  return codePoint === 0x0a || codePoint === 0x09 || (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff) || WIN_ANSI_EXTRA.has(codePoint);
}

/**
 * Makes text safe for react-pdf's built-in Helvetica, whose encoding is WinAnsi: pdfkit truncates
 * every other code point to its low byte, so "−", "→", "✓", emoji and non-Latin scripts come out as
 * wrong or missing glyphs. Known symbols get ASCII stand-ins, accented letters keep their base letter,
 * other scripts leave a single "?" per run, and emoji or symbols are dropped.
 */
export function pdfText(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input.normalize("NFC")) {
    const codePoint = ch.codePointAt(0) ?? 0;
    if (isWinAnsi(codePoint)) {
      out += ch;
      continue;
    }
    const mapped = PDF_REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const base = ch.normalize("NFD")[0];
    if (base !== undefined && base !== ch && isWinAnsi(base.codePointAt(0) ?? 0)) {
      out += base;
      continue;
    }
    if (/[\p{L}\p{N}]/u.test(ch) && !out.endsWith("?")) out += "?";
  }
  return out;
}

/** Applies pdfText to every string inside a value; numbers, booleans, dates and null pass through. */
export function pdfSafe<T>(value: T): T {
  if (typeof value === "string") return pdfText(value) as T;
  if (Array.isArray(value)) return value.map((item) => pdfSafe(item)) as T;
  if (value instanceof Date) return value;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, pdfSafe(item)])) as T;
  }
  return value;
}
