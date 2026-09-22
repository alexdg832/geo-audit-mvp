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
      users: {
        select: {
          id: true,
          email: true,
          contactRequests: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
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
  const contactRequest = business.users[0]?.contactRequests[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav title={business.name} />

      <Card>
        <h2 className="text-lg font-semibold text-stone-900">Client profile</h2>
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <p className="text-stone-500">
              Website:{" "}
              <span className="text-stone-800">{business.website ?? "Not provided"}</span>
            </p>
            <p className="text-stone-500">
              Location:{" "}
              <span className="text-stone-800">{business.location ?? "Not provided"}</span>
            </p>
            <p className="text-stone-500">
              Login email{business.users.length === 1 ? "" : "s"}:{" "}
              <span className="text-stone-800">
                {business.users.length > 0
                  ? business.users.map((u) => u.email).join(", ")
                  : "None yet"}
              </span>
            </p>
            <p className="text-stone-500">
              Wants a call:{" "}
              <span className="text-stone-800">{contactRequest?.wantsCall ? "Yes" : "No"}</span>
            </p>
          </div>
          <div className="rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              What they told us they want
            </p>
            {contactRequest?.goals ? (
              <p className="mt-1 text-stone-800">{contactRequest.goals}</p>
            ) : (
              <p className="mt-1 text-stone-500">
                No goals submitted — this client skipped straight to the dashboard.
              </p>
            )}
            {contactRequest?.name && (
              <p className="mt-2 text-xs text-stone-500">
                Submitted by {contactRequest.name} ({contactRequest.email})
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Client audit</h2>
        <div className="mt-3">
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
        </div>
      </Card>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-stone-900">GEO optimization</h2>
        <p className="mt-1 text-sm text-stone-600">
          These are the tools we use to shape what AI says about this client — a visual
          walkthrough for now, not wired up to real publishing yet.
        </p>
      </div>

      <Card className="mt-4">
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
