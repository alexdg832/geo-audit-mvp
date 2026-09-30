import { prisma } from "@/lib/db";
import { ENGINE_LABELS, type EngineId } from "@/lib/providers/types";
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

export async function loadReport(auditId: string): Promise<ReportData | null> {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      business: { select: { id: true, name: true, _count: { select: { users: true } } } },
      report: true,
      breakdowns: { orderBy: { order: "asc" } },
      engines: true,
      prompts: { orderBy: { index: "asc" } },
      competitors: { orderBy: { runCount: "desc" } },
      siteCheck: true,
      runs: { include: { citations: { orderBy: { index: "asc" } } }, orderBy: [{ runIndex: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!audit || !audit.scanVersion || !audit.report) return null;

  const promptById = new Map(audit.prompts.map((p) => [p.id, p]));
  const report = audit.report;

  return {
    audit: {
      id: audit.id,
      businessId: audit.business.id,
      businessName: audit.resolvedName ?? audit.business.name,
      website: audit.resolvedWebsite,
      domain: audit.resolvedDomain,
      location: audit.resolvedLocation,
      category: audit.category,
      ambiguity: audit.ambiguity,
      createdAt: audit.createdAt.toISOString(),
      completedAt: audit.completedAt?.toISOString() ?? null,
      isMock: audit.isMock,
      scanVersion: audit.scanVersion,
      scoringVersion: audit.scoringVersion,
      status: audit.status,
      runsPerPrompt: audit.runsPerPrompt,
    },
    report: {
      score: report.score,
      grade: report.grade,
      confidence: report.confidence,
      verdict: report.verdict,
      pillars: (report.pillars as unknown as ReportData["report"]["pillars"]) ?? [],
      caps: (report.caps as unknown as CapApplied[]) ?? [],
      criticalFailures: (report.criticalFailures as unknown as CriticalFailure[]) ?? [],
      roadmap: (report.roadmap as unknown as RoadmapItem[]) ?? [],
      costOfInaction: (report.costOfInaction as unknown as CostOfInaction | null) ?? null,
      generatedAt: report.generatedAt.toISOString(),
    },
    breakdowns: audit.breakdowns.map((b) => ({
      id: b.id,
      pillar: b.pillar,
      metric: b.metric,
      label: b.label,
      weight: b.weight,
      value: b.value,
      points: b.points,
      pointsLost: b.pointsLost,
      confidence: b.confidence,
      finding: b.finding,
      evidence: (b.evidence as BreakdownView["evidence"]) ?? {},
      order: b.order,
    })),
    engines: audit.engines.map((e) => ({
      engine: e.engine,
      label: ENGINE_LABELS[e.engine as EngineId] ?? e.engine,
      status: e.status,
      model: e.model,
      callsMade: e.callsMade,
      error: e.error,
    })),
    prompts: audit.prompts.map((p) => ({ id: p.id, index: p.index, kind: p.kind as PromptKind, text: p.text })),
    runs: audit.runs.map((r) => {
      const prompt = promptById.get(r.promptId);
      return {
        id: r.id,
        engine: r.engine,
        engineLabel: ENGINE_LABELS[r.engine as EngineId] ?? r.engine,
        model: r.model,
        promptId: r.promptId,
        promptIndex: prompt?.index ?? 0,
        promptKind: (prompt?.kind ?? "recommendation") as PromptKind,
        promptText: prompt?.text ?? "",
        runIndex: r.runIndex,
        status: r.status,
        answerText: r.answerText,
        latencyMs: r.latencyMs,
        cached: r.cached,
        noCitations: r.noCitations,
        error: r.error,
        mentioned: r.mentioned,
        mentionPosition: r.mentionPosition,
        mentionStart: r.mentionStart,
        mentionEnd: r.mentionEnd,
        sentiment: r.sentiment,
        accuracy: r.accuracy,
        accuracyNotes: r.accuracyNotes,
        competitors: Array.isArray(r.competitors) ? (r.competitors as RunView["competitors"]) : [],
        completedAt: r.completedAt?.toISOString() ?? null,
        citations: r.citations.map((c) => ({
          id: c.id,
          index: c.index,
          url: c.url,
          domain: c.domain,
          title: c.title,
          tier: c.tier as 1 | 2 | 3 | 4,
          tierReason: c.tierReason,
          isBusinessOwned: c.isBusinessOwned,
          passageStart: c.passageStart,
          passageEnd: c.passageEnd,
          passageText: c.passageText,
          citedText: c.citedText,
        })),
      };
    }),
    competitors: audit.competitors.map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      mentionCount: c.mentionCount,
      runCount: c.runCount,
      engines: Array.isArray(c.engines) ? (c.engines as string[]) : [],
      evidenceRunIds: Array.isArray(c.evidenceRunIds) ? (c.evidenceRunIds as string[]) : [],
    })),
    site: (audit.siteCheck?.raw as SiteScanResult | null) ?? null,
    hasAccount: audit.business._count.users > 0,
  };
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
