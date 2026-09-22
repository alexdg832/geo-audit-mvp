import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import { Card } from "@/components/ui/Card";

export default async function AdminClientsPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const businesses = await prisma.business.findMany({
    where: { users: { some: {} } },
    include: {
      users: { include: { contactRequests: { orderBy: { createdAt: "desc" }, take: 1 } } },
      audits: { where: { status: "complete" }, orderBy: { completedAt: "desc" }, take: 1 },
      contentPushes: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav title="Clients" />
      <p className="mb-6 text-stone-600">All signed-up clients and their latest activity.</p>

      {businesses.length === 0 ? (
        <Card>
          <p className="text-stone-500">No clients yet.</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-stone-200">
            {businesses.map((business) => {
              const latestScore = business.audits[0]?.score ?? null;
              const goals = business.users[0]?.contactRequests[0]?.goals ?? null;
              const activityDates = [
                business.contentPushes[0]?.updatedAt,
                business.audits[0]?.completedAt,
                business.createdAt,
              ].filter((d): d is Date => Boolean(d));
              const lastActivity = activityDates.reduce((latest, current) =>
                current > latest ? current : latest
              );

              return (
                <li key={business.id}>
                  <Link
                    href={`/admin/clients/${business.id}`}
                    className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">{business.name}</p>
                      {goals ? (
                        <p className="mt-1 truncate text-sm text-stone-600">{goals}</p>
                      ) : (
                        <p className="mt-1 text-sm text-stone-400">No goals submitted</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 sm:flex-shrink-0">
                      <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
                        {latestScore ?? "—"}
                      </span>
                      <span className="text-sm text-stone-500">
                        {lastActivity.toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </main>
  );
}
