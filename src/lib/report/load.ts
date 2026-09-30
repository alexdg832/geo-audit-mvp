import { prisma } from "@/lib/db";
import { ENGINE_LABELS, type EngineId } from "@/lib/providers/types";
import type { PromptKind } from "@/lib/scan/prompts";
import type { SiteScanResult } from "@/lib/scan/siteScan";
import type { CapApplied, CostOfInaction, CriticalFailure, RoadmapItem } from "@/lib/scoring/types";
import type { BreakdownView, ReportData, RunView } from "./format";

// The view-model types and safeHref live in ./format (no db import) so client components can use
// them without dragging Prisma into the browser bundle; re-exported here for server-side callers.
export type { BreakdownView, CitationView, ReportData, RunView } from "./format";

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
