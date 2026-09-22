import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import { Card } from "@/components/ui/Card";
import { TruthBriefForm } from "@/components/admin/TruthBriefForm";
import { ContentPushForm } from "@/components/admin/ContentPushForm";
import { ContentPushStatusSelect } from "@/components/admin/ContentPushStatusSelect";
import { SendNotificationForm } from "@/components/admin/SendNotificationForm";

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { id } = await params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      truthBrief: true,
      users: { select: { id: true, email: true } },
      contentPushes: { orderBy: { createdAt: "desc" } },
      audits: {
        where: { status: "complete" },
        orderBy: { completedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!business) notFound();

  const latestAudit = business.audits[0];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav title={business.name} />

      <Card>
        <h2 className="text-lg font-semibold text-stone-900">Client audit</h2>
        <div className="mt-3 space-y-3">
          {latestAudit ? (
            <div className="flex items-center justify-between">
              <p className="text-stone-700">
                Score: <span className="font-semibold text-stone-900">{latestAudit.score}</span>
              </p>
              <Link
                href={`/audit/${latestAudit.id}/results`}
                className="text-sm font-medium text-accent hover:underline"
              >
                View full audit →
              </Link>
            </div>
          ) : (
            <p className="text-stone-500">No completed audit yet.</p>
          )}
          <p className="text-sm text-stone-500">
            Login email{business.users.length === 1 ? "" : "s"}:{" "}
            {business.users.length > 0
              ? business.users.map((u) => u.email).join(", ")
              : "None yet"}
          </p>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Truth Brief</h2>
        <div className="mt-4">
          <TruthBriefForm businessId={business.id} initialValues={business.truthBrief} />
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Content pushes</h2>
        <div className="mt-4 space-y-3">
          {business.contentPushes.length === 0 ? (
            <p className="text-sm text-stone-500">No content pushes yet.</p>
          ) : (
            <ul className="space-y-3">
              {business.contentPushes.map((push) => (
                <li
                  key={push.id}
                  className="flex flex-col gap-3 rounded-lg border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-stone-900">{push.title}</p>
                    <p className="text-sm text-stone-500">
                      {push.type}
                      {push.targetChannel ? ` · ${push.targetChannel}` : ""}
                      {" · "}
                      {push.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <ContentPushStatusSelect
                    pushId={push.id}
                    businessId={business.id}
                    currentStatus={push.status}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-6 border-t border-stone-200 pt-6">
          <ContentPushForm businessId={business.id} />
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Send notification</h2>
        <div className="mt-4">
          <SendNotificationForm businessId={business.id} />
        </div>
      </Card>
    </main>
  );
}
