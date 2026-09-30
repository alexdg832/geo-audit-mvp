import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminReplyToThreadAction, setSupportThreadStatusAction } from "@/lib/actions/support";
import { isAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AdminNav } from "@/components/AdminNav";
import { MessageList } from "@/components/support/MessageList";
import { SupportMessageForm } from "@/components/support/SupportMessageForm";
import { ThreadStatusBadge } from "@/components/support/ThreadStatus";
import { Card } from "@/components/ui/Card";

const statusButtonClass = "rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50";

export default async function AdminSupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { id } = await params;
  const thread = await prisma.supportThread.findUnique({
    where: { id },
    include: {
      business: { include: { users: { select: { email: true } } } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!thread) notFound();

  const emails = thread.business.users.map((u) => u.email);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav title={thread.subject} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="text-stone-600">
          <Link href="/admin/support" className="text-stone-500 hover:text-stone-700">
            ← Support inbox
          </Link>
          {" · "}
          <Link href={`/admin/clients/${thread.business.id}`} className="font-medium text-stone-900 hover:underline">
            {thread.business.name}
          </Link>
          {emails.length > 0 && <span className="text-stone-500"> · {emails.join(", ")}</span>}
        </div>
        <div className="flex items-center gap-2">
          <ThreadStatusBadge status={thread.status} viewer="admin" />
          {thread.status === "closed" ? (
            <form action={setSupportThreadStatusAction.bind(null, thread.id, "open")}>
              <button className={statusButtonClass}>Reopen</button>
            </form>
          ) : (
            <form action={setSupportThreadStatusAction.bind(null, thread.id, "closed")}>
              <button className={statusButtonClass}>Close</button>
            </form>
          )}
        </div>
      </div>

      <Card>
        <MessageList messages={thread.messages} viewer="admin" />
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Reply</h2>
        <p className="mt-1 text-xs text-stone-500">
          {emails.length > 0 ? `Emailed to ${emails.join(", ")} and shown in their dashboard.` : "This business has no login yet; the reply is only shown in the dashboard once they sign up."}
        </p>
        <div className="mt-4">
          <SupportMessageForm action={adminReplyToThreadAction.bind(null, thread.id)} submitLabel="Send reply" placeholder="Write your reply to the client" />
        </div>
      </Card>
    </main>
  );
}
