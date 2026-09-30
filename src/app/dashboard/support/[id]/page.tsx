import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { replyToSupportThreadAction } from "@/lib/actions/support";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { MessageList } from "@/components/support/MessageList";
import { SupportMessageForm } from "@/components/support/SupportMessageForm";
import { ThreadStatusBadge } from "@/components/support/ThreadStatus";
import { Card } from "@/components/ui/Card";

export default async function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  // Email deep links land here on a fresh device; send the visitor back to this thread after they log in.
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/support/${id}`)}`);

  const thread = await prisma.supportThread.findFirst({
    where: { id, businessId: user.businessId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6">
        <Link href="/dashboard/support" className="text-sm text-stone-500 hover:text-stone-700">
          ← Support
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-900">{thread.subject}</h1>
          <ThreadStatusBadge status={thread.status} viewer="client" />
        </div>
      </header>

      <Card>
        <MessageList messages={thread.messages} viewer="client" />
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">{thread.status === "closed" ? "Reopen this conversation" : "Reply"}</h2>
        <div className="mt-4">
          <SupportMessageForm action={replyToSupportThreadAction.bind(null, thread.id)} submitLabel="Send reply" placeholder="Write your reply" note="We also get this by email." />
        </div>
      </Card>
    </main>
  );
}
