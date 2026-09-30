import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/actions/auth";
import { rerunAuditAction } from "@/lib/actions/audit";
import { prisma } from "@/lib/db";
import { CATEGORY_MAX } from "@/lib/audit/score";
import { PILLARS } from "@/lib/scoring";
import { ScoreGauge } from "@/components/ScoreGauge";
import { CategoryBar } from "@/components/CategoryBar";
import { ContentPushTimeline } from "@/components/ContentPushTimeline";
import { NotificationBell } from "@/components/NotificationBell";
import { Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";

// rerunAuditAction kicks the first scan tick with after(); it runs up to this limit.
export const maxDuration = 120;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [latestAudit, runningAudit, contentPushes] = await Promise.all([
    prisma.audit.findFirst({
      where: { businessId: user.businessId, status: "complete" },
      orderBy: { completedAt: "desc" },
      include: { report: true },
    }),
    prisma.audit.findFirst({
      where: { businessId: user.businessId, status: "running" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.contentPush.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const pillars = (latestAudit?.report?.pillars as { key: string; label: string; weight: number; score: number }[] | undefined) ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-500">Welcome back</p>
          <h1 className="text-2xl font-bold text-stone-900">{user.business.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <form action={logoutAction}>
            <button className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700">Log out</button>
          </form>
        </div>
      </header>

      <Card>
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex w-full flex-col items-center sm:w-auto">
            {latestAudit ? <ScoreGauge score={latestAudit.score ?? 0} grade={latestAudit.report?.grade} /> : <p className="text-stone-500">No completed audit yet.</p>}
            {latestAudit && (
              <Link href={`/audit/${latestAudit.id}/results`} className="mt-3 text-sm font-medium text-accent hover:underline">
                View full report →
              </Link>
            )}
          </div>
          <div className="w-full space-y-4 sm:max-w-sm">
            {latestAudit && pillars
              ? PILLARS.map((p) => {
                  const s = pillars.find((x) => x.key === p.key);
                  return <CategoryBar key={p.key} label={p.label} score={s?.score ?? 0} max={p.weight} tooltip={p.description} />;
                })
              : latestAudit && (
                  <>
                    <CategoryBar label="Source Trust" score={latestAudit.sourceTrustScore ?? 0} max={CATEGORY_MAX.sourceTrust} />
                    <CategoryBar label="Consistency" score={latestAudit.consistencyScore ?? 0} max={CATEGORY_MAX.consistency} />
                    <CategoryBar label="Website AI Readiness" score={latestAudit.aiReadinessScore ?? 0} max={CATEGORY_MAX.aiReadiness} />
                    <CategoryBar label="AI Visibility" score={latestAudit.aiVisibilityScore ?? 0} max={CATEGORY_MAX.aiVisibility} />
                  </>
                )}
            {runningAudit ? (
              <LinkButton href={`/audit/${runningAudit.id}/running`} variant="secondary" className="w-full">
                A scan is in progress — view
              </LinkButton>
            ) : (
              <form action={rerunAuditAction.bind(null, user.businessId)}>
                <Button type="submit" variant="secondary" className="w-full">
                  Re-run audit
                </Button>
              </form>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Content push timeline</h2>
        <ContentPushTimeline pushes={contentPushes} />
      </Card>
    </main>
  );
}
