import Link from "next/link";
import { redirect } from "next/navigation";
import { resumeScanAction } from "@/lib/actions/admin";
import { isAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

function when(d: Date | null): string {
  return d ? d.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) : "—";
}

const STALE_AFTER_MS = 5 * 60 * 1000;

function isStale(audit: { status: string; lastProgressAt: Date | null }): boolean {
  return audit.status === "running" && audit.lastProgressAt !== null && Date.now() - audit.lastProgressAt.getTime() > STALE_AFTER_MS;
}

export default async function AdminScansPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const audits = await prisma.audit.findMany({
    where: { scanVersion: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { business: { select: { name: true } }, engines: true },
  });
  const counts = await prisma.engineRun.groupBy({
    by: ["auditId", "status"],
    where: { auditId: { in: audits.map((a) => a.id) } },
    _count: { _all: true },
  });
  const unitsFor = (auditId: string) => {
    const own = counts.filter((c) => c.auditId === auditId);
    const total = own.reduce((s, c) => s + c._count._all, 0);
    const done = own.filter((c) => c.status === "complete").reduce((s, c) => s + c._count._all, 0);
    const failed = own.filter((c) => c.status === "failed" || c.status === "skipped").reduce((s, c) => s + c._count._all, 0);
    return { total, done, failed };
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <AdminNav title="Scans" />
      <p className="mb-6 text-stone-600">The 50 most recent scans. A running scan that has not progressed for a while can be resumed here; resuming advances it by one batch of work.</p>

      <Card>
        {audits.length === 0 ? (
          <p className="text-stone-500">No scans yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="py-1 pr-3">Business</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Progress</th>
                <th className="py-1 pr-3">Score</th>
                <th className="py-1 pr-3">Started</th>
                <th className="py-1 pr-3">Last progress</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 align-top">
              {audits.map((a) => {
                const u = unitsFor(a.id);
                const stale = isStale(a);
                return (
                  <tr key={a.id}>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-stone-900">{a.resolvedName ?? a.business.name}</div>
                      <div className="text-xs text-stone-500">
                        {a.resolvedDomain ?? "no website"} · {a.engines.filter((e) => e.status === "live").length} engines live
                        {a.isMock && (
                          <>
                            {" "}
                            <Badge tone="amber">mock</Badge>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={a.status === "complete" ? "green" : a.status === "failed" ? "red" : stale ? "amber" : "indigo"}>{stale ? "stalled" : a.status}</Badge>
                      {a.status === "running" && <div className="text-xs text-stone-500">{a.stage}</div>}
                      {a.error && <div className="max-w-xs truncate text-xs text-red-700">{a.error}</div>}
                    </td>
                    <td className="py-2 pr-3 text-stone-700">
                      {u.done}/{u.total}
                      {u.failed > 0 && <span className="text-red-700"> ({u.failed} failed)</span>}
                    </td>
                    <td className="py-2 pr-3 font-semibold text-stone-900">{a.score ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-stone-500">{when(a.createdAt)}</td>
                    <td className="py-2 pr-3 text-xs text-stone-500">{when(a.lastProgressAt)}</td>
                    <td className="py-2 text-right">
                      {a.status === "complete" ? (
                        <Link href={`/audit/${a.id}/results`} className="text-sm font-medium text-accent hover:underline">
                          Report →
                        </Link>
                      ) : a.status === "running" ? (
                        <form action={resumeScanAction.bind(null, a.id)}>
                          <button className="rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50">Resume</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
