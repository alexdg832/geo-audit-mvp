import { prisma } from "@/lib/db";
import { checkWebsite } from "./checks/website";
import { generateMockMentions } from "./mocks/mentions";
import { generateMockConsistency } from "./mocks/consistency";
import { generateMockAiVisibility } from "./mocks/aiVisibility";
import { generateMockAiSnippet } from "./mocks/aiSnippet";
import { computeCategoryScores, totalScore } from "./score";
import { buildRecommendations } from "./recommendations";
import { initialSteps } from "./steps";
import { AuditStep, StepKey } from "./types";

function isFast(): boolean {
  return process.env.AUDIT_DEMO_FAST === "true";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simulates the time a real check would take, shortened under AUDIT_DEMO_FAST. */
async function simulateWork(ms: number): Promise<void> {
  await delay(isFast() ? Math.round(ms / 6) : ms);
}

async function markStepStatus(
  auditId: string,
  steps: AuditStep[],
  key: StepKey,
  status: AuditStep["status"]
): Promise<AuditStep[]> {
  const updated = steps.map((s) => (s.key === key ? { ...s, status } : s));
  await prisma.audit.update({
    where: { id: auditId },
    data: { stepsJson: JSON.stringify(updated) },
  });
  return updated;
}

/**
 * Runs the full audit pipeline for a business, persisting step progress and
 * final results to the database as it goes. Intentionally not awaited by the
 * API route that kicks it off, so the client can poll status separately.
 *
 * NOTE: for a real deployment this should run in a background job/queue
 * (e.g. Vercel Queues) rather than as a fire-and-forget promise, since a
 * serverless function can be frozen once its response is sent.
 */
export async function runAudit(auditId: string): Promise<void> {
  const audit = await prisma.audit.findUniqueOrThrow({
    where: { id: auditId },
    include: { business: true },
  });
  const { business } = audit;

  let steps = initialSteps();
  await prisma.audit.update({
    where: { id: auditId },
    data: { stepsJson: JSON.stringify(steps) },
  });

  // Step 1: website
  steps = await markStepStatus(auditId, steps, "website", "in_progress");
  const websiteChecks = await checkWebsite(business.website);
  await simulateWork(1200);
  steps = await markStepStatus(auditId, steps, "website", "done");

  // Step 2: mentions
  steps = await markStepStatus(auditId, steps, "mentions", "in_progress");
  const mentions = generateMockMentions(business.name, business.website);
  await simulateWork(4000);
  steps = await markStepStatus(auditId, steps, "mentions", "done");

  // Step 3: source trust grading
  steps = await markStepStatus(auditId, steps, "sourceTrust", "in_progress");
  const consistency = generateMockConsistency(business.name, business.location);
  await simulateWork(3500);
  steps = await markStepStatus(auditId, steps, "sourceTrust", "done");

  // Step 4: AI readiness
  steps = await markStepStatus(auditId, steps, "aiReadiness", "in_progress");
  const aiVisibility = generateMockAiVisibility(business.name);
  const aiSnippet = generateMockAiSnippet(business.name, business.location, aiVisibility.isMentioned);
  await simulateWork(3500);
  steps = await markStepStatus(auditId, steps, "aiReadiness", "done");

  // Step 5: final score
  steps = await markStepStatus(auditId, steps, "score", "in_progress");
  const categories = computeCategoryScores({ mentions, consistency, websiteChecks, aiVisibility });
  const score = totalScore(categories);
  const recommendations = buildRecommendations({ categories, websiteChecks, mentions, consistency });
  await simulateWork(1800);
  steps = await markStepStatus(auditId, steps, "score", "done");

  await prisma.$transaction([
    prisma.sourceMention.createMany({
      data: mentions.map((m) => ({
        auditId,
        name: m.name,
        url: m.url,
        tier: m.tier,
        snippet: m.snippet,
        accurate: m.accurate,
      })),
    }),
    prisma.audit.update({
      where: { id: auditId },
      data: {
        status: "complete",
        completedAt: new Date(),
        score,
        sourceTrustScore: categories.sourceTrust,
        consistencyScore: categories.consistency,
        aiReadinessScore: categories.aiReadiness,
        aiVisibilityScore: categories.aiVisibility,
        websiteChecksJson: JSON.stringify(websiteChecks),
        aiSnippetJson: JSON.stringify(aiSnippet),
        recommendationsJson: JSON.stringify(recommendations),
      },
    }),
  ]);
}
