import type { Prisma, ScanEngine, TruthBrief } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notifyBusinessUsers } from "@/lib/notifications";
import { getCachedResponse, promptCacheKey, recordProviderEvent, setCachedResponse } from "@/lib/providers/cache";
import { DEFAULT_COMPLETION_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS } from "@/lib/providers/limits";
import { assertMockAllowed, getClassifier, getProviders, isMockMode } from "@/lib/providers/registry";
import { type AIProvider, ENGINE_LABELS, type EngineId, LIVE_ENGINE_IDS, type ProviderResponse } from "@/lib/providers/types";
import { computeScore } from "@/lib/scoring";
import type { CompetitorInput, EngineInput, RunInput, ScoringInput } from "@/lib/scoring/types";
import { analyzeDeterministic, buildClassifierPrompt, mergeAnalysis, normalizeCompetitorName, parseClassifierOutput } from "./analyze";
import { domainOf } from "./fetcher";
import { generatePrompts, type PromptKind } from "./prompts";
import { resolveBusiness } from "./resolveBusiness";
import { scanSite, type SiteScanResult } from "./siteScan";
import { classifySource } from "./sources";

export const SCAN_VERSION = "2026.09.30";
export const DEFAULT_RUNS_PER_PROMPT = 2;
export const DEFAULT_MAX_PROVIDER_CALLS = 120;
export const MAX_ATTEMPTS = 3;
const STAGE_LEASE_MS = 120_000;
const MAX_RAW_RESPONSE_BYTES = 200_000;

export interface StartScanInput {
  businessId: string;
  name: string;
  website: string | null;
  location: string | null;
  requesterIpHash: string | null;
}

export interface TickResult {
  auditId: string;
  status: string;
  stage: string | null;
  isMock: boolean;
  units: { total: number; complete: number; failed: number; pending: number; running: number; skipped: number };
  engines: { engine: string; label: string; status: string; complete: number; failed: number; total: number }[];
  message: string;
}

type AuditRow = NonNullable<Awaited<ReturnType<typeof loadAudit>>>;

async function loadAudit(auditId: string) {
  return prisma.audit.findUnique({ where: { id: auditId }, include: { engines: true } });
}

/** Creates the audit row and its engine roster. Work starts on the first tick. */
export async function createScan(input: StartScanInput): Promise<{ auditId: string }> {
  assertMockAllowed();
  const providers = getProviders();
  const mock = isMockMode();
  const configured = new Set(providers.map((p) => p.id));
  const engines: Prisma.ScanEngineCreateWithoutAuditInput[] = mock
    ? [{ engine: "mock", status: "live", model: providers[0]?.model ?? null }]
    : LIVE_ENGINE_IDS.map((id) => {
        const provider = providers.find((p) => p.id === id);
        return { engine: id, status: configured.has(id) ? "live" : "not_configured", model: provider?.model ?? null };
      });
  const now = new Date();
  const audit = await prisma.audit.create({
    data: {
      businessId: input.businessId,
      status: "running",
      stepsJson: "[]",
      scanVersion: SCAN_VERSION,
      stage: "site",
      isMock: mock,
      resolvedName: input.name,
      resolvedWebsite: input.website,
      resolvedLocation: input.location,
      runsPerPrompt: DEFAULT_RUNS_PER_PROMPT,
      maxProviderCalls: DEFAULT_MAX_PROVIDER_CALLS,
      requesterIpHash: input.requesterIpHash,
      startedAt: now,
      lastProgressAt: now,
      engines: { create: engines },
    },
  });
  return { auditId: audit.id };
}

/** Advances a scan by one unit of work. Safe to call from any instance at any time. */
export async function advanceScan(auditId: string): Promise<TickResult> {
  const audit = await loadAudit(auditId);
  if (!audit || !audit.scanVersion) throw new Error("Audit is not a scan-engine audit");
  if (audit.status === "running") {
    switch (audit.stage) {
      case "site":
      case "site_running":
        await runSiteStage(audit);
        break;
      case "queries":
        await runQueryBatch(audit);
        break;
      case "finalize":
      case "finalizing":
        await runFinalize(audit);
        break;
    }
  }
  return summarize(auditId);
}

export async function summarize(auditId: string): Promise<TickResult> {
  const audit = await loadAudit(auditId);
  if (!audit) throw new Error("Audit not found");
  const grouped = await prisma.engineRun.groupBy({ by: ["engine", "status"], where: { auditId }, _count: { _all: true } });
  const units = { total: 0, complete: 0, failed: 0, pending: 0, running: 0, skipped: 0 };
  const perEngine = new Map<string, { complete: number; failed: number; total: number }>();
  for (const g of grouped) {
    const n = g._count._all;
    units.total += n;
    if (g.status in units) units[g.status as keyof typeof units] += n;
    const e = perEngine.get(g.engine) ?? { complete: 0, failed: 0, total: 0 };
    e.total += n;
    if (g.status === "complete") e.complete += n;
    if (g.status === "failed" || g.status === "skipped") e.failed += n;
    perEngine.set(g.engine, e);
  }
  const engines = audit.engines.map((e) => ({
    engine: e.engine,
    label: ENGINE_LABELS[e.engine as EngineId] ?? e.engine,
    status: e.status,
    ...(perEngine.get(e.engine) ?? { complete: 0, failed: 0, total: 0 }),
  }));
  return {
    auditId,
    status: audit.status,
    stage: audit.stage,
    isMock: audit.isMock,
    units,
    engines,
    message: describe(audit.status, audit.stage, units, audit.error),
  };
}

function describe(status: string, stage: string | null, units: TickResult["units"], error: string | null): string {
  if (status === "complete") return "Report ready";
  if (status === "failed") return error ? `Scan failed: ${error}` : "Scan failed";
  switch (stage) {
    case "site":
    case "site_running":
      return "Checking your website and building the prompt set";
    case "queries":
      return `Asking AI engines (${units.complete + units.failed + units.skipped} of ${units.total} checks done)`;
    case "finalize":
    case "finalizing":
      return "Scoring the evidence and writing your report";
    default:
      return "Working";
  }
}

async function runSiteStage(audit: AuditRow): Promise<void> {
  const claimed = await prisma.audit.updateMany({
    where: {
      id: audit.id,
      status: "running",
      OR: [{ stage: "site" }, { stage: "site_running", lastProgressAt: { lt: new Date(Date.now() - STAGE_LEASE_MS) } }],
    },
    data: { stage: "site_running", lastProgressAt: new Date() },
  });
  if (claimed.count === 0) return;

  try {
    const site = await scanSite(audit.resolvedWebsite);
    const resolved = resolveBusiness(
      { name: audit.resolvedName ?? "", website: audit.resolvedWebsite, location: audit.resolvedLocation },
      site
    );
    const prompts = generatePrompts({ name: resolved.name, category: resolved.category, location: resolved.location });
    const liveEngines = audit.engines.filter((e) => e.status === "live").map((e) => e.engine);

    await prisma.$transaction(async (tx) => {
      await tx.siteCheck.create({ data: siteCheckData(audit.id, site) });
      for (const p of prompts) {
        const row = await tx.scanPrompt.create({ data: { auditId: audit.id, index: p.index, kind: p.kind, text: p.text } });
        const runs: Prisma.EngineRunCreateManyInput[] = [];
        for (const engine of liveEngines) {
          for (let runIndex = 0; runIndex < audit.runsPerPrompt; runIndex++) {
            runs.push({ auditId: audit.id, promptId: row.id, engine, runIndex, status: "pending" });
          }
        }
        if (runs.length) await tx.engineRun.createMany({ data: runs });
      }
      await tx.audit.update({
        where: { id: audit.id },
        data: {
          resolvedName: resolved.name,
          resolvedWebsite: resolved.website,
          resolvedDomain: resolved.domain,
          resolvedLocation: resolved.location,
          category: resolved.category,
          stage: liveEngines.length ? "queries" : "finalize",
          lastProgressAt: new Date(),
        },
      });
    });
  } catch (err) {
    await failScan(audit.id, err);
  }
}

function siteCheckData(auditId: string, site: SiteScanResult): Prisma.SiteCheckUncheckedCreateInput {
  return {
    auditId,
    url: site.url,
    fetchOk: site.fetchOk,
    fetchError: site.fetchError,
    httpStatus: site.httpStatus,
    finalUrl: site.finalUrl,
    https: site.https,
    responseMs: site.responseMs,
    htmlBytes: site.htmlBytes,
    title: site.title,
    metaDescription: site.metaDescription,
    h1: site.h1,
    wordCount: site.wordCount,
    textRatio: site.textRatio,
    jsRequired: site.jsRequired,
    metaRobots: site.metaRobots,
    schemaTypes: site.schemaTypes,
    schemaHasNap: site.schemaHasNap,
    hasAboutPage: site.hasAboutPage,
    hasContactInfo: site.hasContactInfo,
    detectedPhone: site.detectedPhone,
    detectedAddress: site.detectedAddress,
    hasHours: site.hasHours,
    hasFaq: site.hasFaq,
    lastModified: parseDate(site.lastModified),
    robotsFound: site.robotsFound,
    robots: site.robots ?? undefined,
    llmsTxtFound: site.llmsTxtFound,
    sitemapFound: site.sitemapFound,
    sitemapUrl: site.sitemapUrl,
    raw: JSON.parse(JSON.stringify(site)),
  };
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface ClaimedRun {
  id: string;
  promptId: string;
  engine: string;
  runIndex: number;
  attempts: number;
}

async function runQueryBatch(audit: AuditRow): Promise<void> {
  const providers = new Map<string, AIProvider>(getProviders().map((p) => [p.id, p]));
  const batchSize = Math.min(8, Math.max(2, providers.size * 2));
  const claimed = await prisma.$queryRaw<ClaimedRun[]>`
    UPDATE "EngineRun"
    SET status = 'running', attempts = attempts + 1, "leaseUntil" = now() + interval '90 seconds'
    WHERE id IN (
      SELECT id FROM "EngineRun"
      WHERE "auditId" = ${audit.id}
        AND attempts < ${MAX_ATTEMPTS}
        AND (status = 'pending' OR (status = 'running' AND "leaseUntil" < now()))
      ORDER BY "runIndex", "promptId", engine
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "promptId", engine, "runIndex", attempts`;

  if (claimed.length === 0) {
    await maybeAdvanceToFinalize(audit.id);
    return;
  }

  const [prompts, siteCheck, truthBrief] = await Promise.all([
    prisma.scanPrompt.findMany({ where: { id: { in: claimed.map((c) => c.promptId) } } }),
    prisma.siteCheck.findUnique({ where: { auditId: audit.id } }),
    prisma.truthBrief.findUnique({ where: { businessId: audit.businessId } }),
  ]);
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  const knownFacts = buildKnownFacts(audit, siteCheck, truthBrief);
  const classifier = getClassifier();

  await Promise.allSettled(
    claimed.map((unit) => {
      const prompt = promptById.get(unit.promptId);
      const provider = providers.get(unit.engine);
      if (!prompt) return markUnit(unit, audit.id, "failed", "Prompt row missing");
      if (!provider) return markUnit(unit, audit.id, "skipped", "Engine is no longer configured");
      return runUnit(audit, unit, { index: prompt.index, text: prompt.text }, provider, classifier, knownFacts);
    })
  );

  await prisma.audit.update({ where: { id: audit.id }, data: { lastProgressAt: new Date() } });
  await maybeAdvanceToFinalize(audit.id);
}

async function maybeAdvanceToFinalize(auditId: string): Promise<void> {
  const remaining = await prisma.engineRun.count({
    where: { auditId, OR: [{ status: "pending" }, { status: "running" }] },
  });
  if (remaining === 0) {
    await prisma.audit.updateMany({ where: { id: auditId, stage: "queries" }, data: { stage: "finalize", lastProgressAt: new Date() } });
  }
}

function buildKnownFacts(
  audit: AuditRow,
  site: { title: string | null; metaDescription: string | null; detectedPhone: string | null; detectedAddress: string | null; hasHours: boolean | null } | null,
  truthBrief: TruthBrief | null
): string[] {
  const facts: string[] = [];
  if (audit.resolvedWebsite) facts.push(`Official website: ${audit.resolvedWebsite}`);
  if (audit.resolvedLocation) facts.push(`Location given by the business: ${audit.resolvedLocation}`);
  if (audit.category) facts.push(`Business category: ${audit.category}`);
  if (site?.title) facts.push(`Website title: ${site.title}`);
  if (site?.metaDescription) facts.push(`Website description: ${site.metaDescription}`);
  if (site?.detectedPhone) facts.push(`Phone on website: ${site.detectedPhone}`);
  if (site?.detectedAddress) facts.push(`Address on website: ${site.detectedAddress}`);
  if (truthBrief?.description) facts.push(`Owner description: ${truthBrief.description}`);
  if (truthBrief?.services) facts.push(`Services: ${truthBrief.services}`);
  if (truthBrief?.location) facts.push(`Owner-stated address: ${truthBrief.location}`);
  for (const line of (truthBrief?.keyFacts ?? "").split("\n").map((l) => l.trim()).filter(Boolean)) facts.push(line);
  return facts;
}

async function markUnit(unit: ClaimedRun, auditId: string, status: "failed" | "skipped", error: string): Promise<void> {
  await prisma.engineRun.update({ where: { id: unit.id }, data: { status, error: error.slice(0, 500), leaseUntil: null, completedAt: new Date() } });
  void auditId;
}

async function reserveCall(auditId: string): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "Audit" SET "providerCallsUsed" = "providerCallsUsed" + 1
    WHERE id = ${auditId} AND "providerCallsUsed" < "maxProviderCalls"`;
  return updated === 1;
}

function boundedJson(value: unknown): Prisma.InputJsonValue {
  const text = JSON.stringify(value ?? null);
  if (text.length <= MAX_RAW_RESPONSE_BYTES) return JSON.parse(text);
  return { truncated: true, bytes: text.length, head: text.slice(0, 20_000) };
}

async function runUnit(
  audit: AuditRow,
  unit: ClaimedRun,
  prompt: { index: number; text: string },
  provider: AIProvider,
  classifier: AIProvider | null,
  knownFacts: string[]
): Promise<void> {
  const businessName = audit.resolvedName ?? "";
  const businessDomain = audit.resolvedDomain ?? null;
  try {
    const promptHash = promptCacheKey(prompt.text, audit.resolvedLocation);
    let response: ProviderResponse | null = await getCachedResponse({ engine: provider.id, promptHash, runIndex: unit.runIndex });
    const cached = response !== null;

    if (!response) {
      if (!(await reserveCall(audit.id))) {
        await markUnit(unit, audit.id, "skipped", "Per-scan provider call cap reached");
        return;
      }
      await prisma.scanEngine.updateMany({ where: { auditId: audit.id, engine: provider.id }, data: { callsMade: { increment: 1 } } });
      const started = Date.now();
      try {
        response = await provider.query(prompt.text, {
          location: audit.resolvedLocation,
          timeoutMs: DEFAULT_QUERY_TIMEOUT_MS,
          mock: {
            businessName,
            businessDomain,
            category: audit.category,
            location: audit.resolvedLocation,
            promptIndex: prompt.index,
            runIndex: unit.runIndex,
          },
        });
        await recordProviderEvent({ engine: provider.id, kind: "query", ok: true, latencyMs: Date.now() - started });
      } catch (err) {
        await recordProviderEvent({ engine: provider.id, kind: "error", ok: false, message: errorMessage(err), latencyMs: Date.now() - started });
        throw err;
      }
      await setCachedResponse({ engine: provider.id, promptHash, runIndex: unit.runIndex }, response);
    }

    const deterministic = analyzeDeterministic(response.answerText, businessName, businessDomain);
    let classifierOutput = null;
    if (classifier?.complete && (await reserveCall(audit.id))) {
      try {
        const { system, user } = buildClassifierPrompt({
          answer: response.answerText,
          businessName,
          businessDomain,
          location: audit.resolvedLocation,
          category: audit.category,
          knownFacts,
        });
        const completion = await classifier.complete(system, user, { timeoutMs: DEFAULT_COMPLETION_TIMEOUT_MS });
        classifierOutput = parseClassifierOutput(completion.text);
      } catch (err) {
        await recordProviderEvent({ engine: classifier.id, kind: "error", ok: false, message: `classifier: ${errorMessage(err)}` });
        classifierOutput = null;
      }
    }
    const analysis = mergeAnalysis(deterministic, classifierOutput, businessName);

    const citations: Prisma.CitationCreateManyInput[] = response.citations.map((c, index) => {
      const tier = classifySource(c.url, businessDomain);
      const hasSpan = c.start !== null && c.end !== null && c.end > c.start;
      return {
        runId: unit.id,
        auditId: audit.id,
        index,
        url: c.url,
        domain: domainOf(c.url),
        title: c.title,
        tier: tier.tier,
        tierReason: tier.reason,
        isBusinessOwned: tier.isBusinessOwned,
        passageStart: hasSpan ? c.start : null,
        passageEnd: hasSpan ? c.end : null,
        passageText: hasSpan ? response.answerText.slice(c.start!, c.end!) : null,
        citedText: c.citedText,
      };
    });

    await prisma.$transaction([
      prisma.citation.deleteMany({ where: { runId: unit.id } }),
      ...(citations.length ? [prisma.citation.createMany({ data: citations })] : []),
      prisma.engineRun.update({
        where: { id: unit.id },
        data: {
          status: "complete",
          model: response.model,
          answerText: response.answerText,
          latencyMs: response.latencyMs,
          cached,
          noCitations: citations.length === 0,
          rawResponse: boundedJson(response.rawResponse),
          error: null,
          leaseUntil: null,
          mentioned: analysis.mentioned,
          mentionPosition: analysis.mentionPosition,
          mentionStart: analysis.mentionStart,
          mentionEnd: analysis.mentionEnd,
          sentiment: analysis.sentiment,
          accuracy: analysis.accuracy,
          accuracyNotes: analysis.accuracyNotes,
          competitors: analysis.competitors,
          analysis: {
            mentionCount: analysis.mentionCount,
            listRank: analysis.listRank,
            listItemCount: analysis.listItemCount,
            classifierUsed: analysis.classifierUsed,
            classifierModel: classifier?.model ?? null,
          },
          completedAt: new Date(),
        },
      }),
    ]);
  } catch (err) {
    const message = errorMessage(err).slice(0, 500);
    const exhausted = unit.attempts >= MAX_ATTEMPTS;
    await prisma.engineRun.update({
      where: { id: unit.id },
      data: { status: exhausted ? "failed" : "pending", error: message, leaseUntil: null, ...(exhausted ? { completedAt: new Date() } : {}) },
    });
    if (exhausted) {
      await prisma.scanEngine.updateMany({ where: { auditId: audit.id, engine: provider.id }, data: { error: message } });
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function failScan(auditId: string, err: unknown): Promise<void> {
  await prisma.audit.update({
    where: { id: auditId },
    data: { status: "failed", stage: "done", error: errorMessage(err).slice(0, 500), completedAt: new Date() },
  });
}

async function runFinalize(audit: AuditRow): Promise<void> {
  const claimed = await prisma.audit.updateMany({
    where: {
      id: audit.id,
      status: "running",
      OR: [{ stage: "finalize" }, { stage: "finalizing", lastProgressAt: { lt: new Date(Date.now() - STAGE_LEASE_MS) } }],
    },
    data: { stage: "finalizing", lastProgressAt: new Date() },
  });
  if (claimed.count === 0) return;

  try {
    const [runs, prompts, siteCheck] = await Promise.all([
      prisma.engineRun.findMany({ where: { auditId: audit.id }, include: { citations: true }, orderBy: [{ runIndex: "asc" }, { createdAt: "asc" }] }),
      prisma.scanPrompt.findMany({ where: { auditId: audit.id } }),
      prisma.siteCheck.findUnique({ where: { auditId: audit.id } }),
    ]);
    const promptById = new Map(prompts.map((p) => [p.id, p]));

    const competitors = aggregateCompetitors(audit.id, runs);
    await prisma.$transaction([
      prisma.competitorDetected.deleteMany({ where: { auditId: audit.id } }),
      ...(competitors.length ? [prisma.competitorDetected.createMany({ data: competitors })] : []),
    ]);
    const competitorRows = await prisma.competitorDetected.findMany({ where: { auditId: audit.id } });

    const engineStatuses = await reconcileEngineStatuses(audit, runs);
    const site = (siteCheck?.raw as SiteScanResult | null) ?? null;

    const input: ScoringInput = {
      businessName: audit.resolvedName ?? "",
      engines: engineStatuses.map<EngineInput>((e) => ({ id: e.engine, label: ENGINE_LABELS[e.engine as EngineId] ?? e.engine, status: e.status as EngineInput["status"] })),
      runs: runs.map<RunInput>((r) => {
        const prompt = promptById.get(r.promptId);
        const analysis = (r.analysis as { listItemCount?: number | null } | null) ?? null;
        const competitorNames = Array.isArray(r.competitors) ? (r.competitors as { name: string }[]).map((c) => c.name) : [];
        return {
          id: r.id,
          engine: r.engine,
          promptIndex: prompt?.index ?? 0,
          promptKind: (prompt?.kind ?? "recommendation") as PromptKind,
          runIndex: r.runIndex,
          status: r.status,
          mentioned: r.mentioned,
          mentionPosition: r.mentionPosition,
          listItemCount: analysis?.listItemCount ?? null,
          sentiment: r.sentiment,
          accuracy: r.accuracy,
          noCitations: r.noCitations,
          citations: r.citations.map((c) => ({ id: c.id, tier: c.tier as 1 | 2 | 3 | 4, isBusinessOwned: c.isBusinessOwned, domain: c.domain })),
          competitorNames,
        };
      }),
      site,
      competitors: competitorRows.map<CompetitorInput>((c) => ({ id: c.id, name: c.name, runCount: c.runCount, mentionCount: c.mentionCount })),
    };

    const output = computeScore(input);
    const pillarSummaries = output.pillars.map((p) => ({ key: p.key, label: p.label, weight: p.weight, score: p.score, confidence: p.confidence }));

    await prisma.$transaction([
      prisma.scoreBreakdown.deleteMany({ where: { auditId: audit.id } }),
      prisma.scoreBreakdown.createMany({
        data: output.metrics.map((m, order) => ({
          auditId: audit.id,
          pillar: m.pillar,
          metric: m.metric,
          label: m.label,
          weight: m.weight,
          value: m.value ?? 0,
          points: m.points,
          pointsLost: m.pointsLost,
          confidence: m.confidence,
          finding: m.finding,
          evidence: JSON.parse(JSON.stringify(m.evidence)),
          order,
        })),
      }),
      prisma.report.upsert({
        where: { auditId: audit.id },
        create: {
          auditId: audit.id,
          scoringVersion: output.version,
          score: output.score,
          grade: output.grade,
          confidence: output.confidence,
          verdict: output.verdict,
          pillars: pillarSummaries,
          caps: JSON.parse(JSON.stringify(output.caps)),
          criticalFailures: JSON.parse(JSON.stringify(output.criticalFailures)),
          roadmap: JSON.parse(JSON.stringify(output.roadmap)),
          costOfInaction: JSON.parse(JSON.stringify(output.costOfInaction)),
        },
        update: {
          scoringVersion: output.version,
          score: output.score,
          grade: output.grade,
          confidence: output.confidence,
          verdict: output.verdict,
          pillars: pillarSummaries,
          caps: JSON.parse(JSON.stringify(output.caps)),
          criticalFailures: JSON.parse(JSON.stringify(output.criticalFailures)),
          roadmap: JSON.parse(JSON.stringify(output.roadmap)),
          costOfInaction: JSON.parse(JSON.stringify(output.costOfInaction)),
          generatedAt: new Date(),
        },
      }),
      prisma.audit.update({
        where: { id: audit.id },
        data: {
          status: "complete",
          stage: "done",
          score: output.score,
          scoringVersion: output.version,
          completedAt: new Date(),
          lastProgressAt: new Date(),
          error: null,
        },
      }),
    ]);

    await notifyBusinessUsers(audit.businessId, `Your new GEO report is ready: score ${output.score}/100 (${output.grade}).`);
  } catch (err) {
    await failScan(audit.id, err);
  }
}

type RunWithCitations = Prisma.EngineRunGetPayload<{ include: { citations: true } }>;

function aggregateCompetitors(auditId: string, runs: RunWithCitations[]): Prisma.CompetitorDetectedCreateManyInput[] {
  const map = new Map<string, { names: Map<string, number>; domain: string | null; mentionCount: number; runs: Set<string>; engines: Set<string> }>();
  for (const run of runs) {
    if (!Array.isArray(run.competitors)) continue;
    for (const raw of run.competitors as { name?: string; domain?: string | null }[]) {
      const name = (raw.name ?? "").trim();
      const key = normalizeCompetitorName(name);
      if (!key) continue;
      const entry = map.get(key) ?? { names: new Map(), domain: null, mentionCount: 0, runs: new Set(), engines: new Set() };
      entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
      if (!entry.domain && raw.domain) entry.domain = raw.domain;
      entry.mentionCount += 1;
      entry.runs.add(run.id);
      entry.engines.add(run.engine);
      map.set(key, entry);
    }
  }
  return Array.from(map.entries()).map(([normalizedName, e]) => ({
    auditId,
    name: Array.from(e.names.entries()).sort((a, b) => b[1] - a[1])[0][0],
    normalizedName,
    domain: e.domain,
    mentionCount: e.mentionCount,
    runCount: e.runs.size,
    engines: Array.from(e.engines),
    evidenceRunIds: Array.from(e.runs),
  }));
}

async function reconcileEngineStatuses(audit: AuditRow, runs: RunWithCitations[]): Promise<ScanEngine[]> {
  for (const engine of audit.engines) {
    if (engine.status !== "live") continue;
    const own = runs.filter((r) => r.engine === engine.engine);
    if (own.length === 0) continue;
    const complete = own.filter((r) => r.status === "complete").length;
    if (complete === 0) {
      await prisma.scanEngine.update({ where: { id: engine.id }, data: { status: "error", error: engine.error ?? own.find((r) => r.error)?.error ?? "All checks failed" } });
    }
  }
  return prisma.scanEngine.findMany({ where: { auditId: audit.id } });
}

/** Rate-limit check for anonymous scan starts: hashed IP per hour and a global hourly ceiling. */
export async function checkScanRateLimit(requesterIpHash: string | null): Promise<string | null> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [global, perIp] = await Promise.all([
    prisma.audit.count({ where: { scanVersion: { not: null }, createdAt: { gte: since } } }),
    requesterIpHash ? prisma.audit.count({ where: { requesterIpHash, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);
  if (global >= Number(process.env.SCAN_GLOBAL_HOURLY_LIMIT ?? 30)) return "Scanning is busy right now. Please try again in a little while.";
  if (perIp >= Number(process.env.SCAN_PER_IP_HOURLY_LIMIT ?? 3)) return "You have started several audits recently. Please wait an hour before starting another.";
  return null;
}
