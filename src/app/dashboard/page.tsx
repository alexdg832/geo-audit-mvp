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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { booked } = await searchParams;

  const [latestAudit, runningAudit, contentPushes, threadCount, repliesWaiting] = await Promise.all([
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
    prisma.supportThread.count({ where: { businessId: user.businessId } }),
    prisma.supportThread.count({ where: { businessId: user.businessId, status: "answered" } }),
  ]);

  const supportSummary =
    repliesWaiting > 0
      ? `${repliesWaiting} ${repliesWaiting === 1 ? "reply is" : "replies are"} waiting for you.`
      : threadCount > 0
        ? `${threadCount} ${threadCount === 1 ? "conversation" : "conversations"} so far. Message us or book a call any time.`
        : "Questions about your report or the fixes? Message us or book a call.";

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

      {booked === "1" && (
        <p className="mb-6 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          Thanks! Our scheduler opened in a new tab. If it did not, you can book from the{" "}
          <Link href="/dashboard/support" className="font-medium underline underline-offset-2">
            support page
          </Link>
          . We have your goals and will be in touch by email.
        </p>
      )}

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Support</h2>
            <p className="mt-1 text-sm text-stone-600">{supportSummary}</p>
          </div>
          <LinkButton href="/dashboard/support" variant={repliesWaiting > 0 ? "primary" : "secondary"} className="shrink-0">
            {repliesWaiting > 0 ? "Read replies" : "Contact us"}
          </LinkButton>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Content push timeline</h2>
        <ContentPushTimeline pushes={contentPushes} />
      </Card>
    </main>
  );
}
