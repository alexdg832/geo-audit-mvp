import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import { formatWhen } from "@/components/support/MessageList";
import { ThreadStatusBadge } from "@/components/support/ThreadStatus";
import { Card } from "@/components/ui/Card";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Needs reply" },
  { key: "answered", label: "Answered" },
  { key: "closed", label: "Closed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { status } = await searchParams;
  const filter: FilterKey = FILTERS.some((f) => f.key === status) ? (status as FilterKey) : "all";

  const [threads, counts] = await Promise.all([
    prisma.supportThread.findMany({
      where: filter === "all" ? {} : { status: filter },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: {
        business: { select: { id: true, name: true, users: { select: { email: true }, take: 1 } } },
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, author: true } },
      },
    }),
    prisma.supportThread.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (key: FilterKey) =>
    key === "all" ? counts.reduce((s, c) => s + c._count._all, 0) : (counts.find((c) => c.status === key)?._count._all ?? 0);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <AdminNav title="Support inbox" />
      <p className="mb-4 text-stone-600">Every message clients send from their dashboard, newest first. A reply from here goes to their dashboard and their email.</p>

      <nav aria-label="Filter conversations" className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/support" : `/admin/support?status=${f.key}`}
            className={`rounded-full border px-3 py-1 ${filter === f.key ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700 hover:bg-stone-50"}`}
          >
            {f.label} <span className="opacity-70">{countFor(f.key)}</span>
          </Link>
        ))}
      </nav>

      <Card>
        {threads.length === 0 ? (
          <p className="text-stone-500">No conversations{filter === "all" ? " yet" : " with this status"}.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="py-1 pr-3">Client</th>
                <th className="py-1 pr-3">Conversation</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Last message</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 align-top">
              {threads.map((t) => {
                const last = t.messages[0];
                return (
                  <tr key={t.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/clients/${t.business.id}`} className="font-medium text-stone-900 hover:underline">
                        {t.business.name}
                      </Link>
                      <div className="text-xs text-stone-500">{t.business.users[0]?.email ?? "no login"}</div>
                    </td>
                    <td className="max-w-md py-2 pr-3">
                      <div className="font-medium text-stone-900">{t.subject}</div>
                      {last && (
                        <div className="truncate text-xs text-stone-500">
                          {last.author === "admin" ? "You: " : ""}
                          {last.body}
                        </div>
                      )}
                      <div className="text-xs text-stone-400">
                        {t._count.messages} {t._count.messages === 1 ? "message" : "messages"}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <ThreadStatusBadge status={t.status} viewer="admin" />
                    </td>
                    <td className="py-2 pr-3 text-xs text-stone-500">{formatWhen(t.lastMessageAt)}</td>
                    <td className="py-2 text-right">
                      <Link href={`/admin/support/${t.id}`} className="text-sm font-medium text-accent hover:underline">
                        Open →
                      </Link>
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
