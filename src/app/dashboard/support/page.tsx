import Link from "next/link";
import { redirect } from "next/navigation";
import { siteConfig } from "@config/site";
import { createSupportThreadAction } from "@/lib/actions/support";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { SupportMessageForm } from "@/components/support/SupportMessageForm";
import { ThreadStatusBadge } from "@/components/support/ThreadStatus";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

function lastActivity(d: Date): string {
  return d.toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" });
}

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [threads, contact] = await Promise.all([
    prisma.supportThread.findMany({
      where: { businessId: user.businessId },
      orderBy: { lastMessageAt: "desc" },
      include: { _count: { select: { messages: true } } },
    }),
    prisma.contactRequest.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link href="/dashboard" className="text-sm text-stone-500 hover:text-stone-700">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-stone-900">Support</h1>
        <p className="mt-1 text-stone-600">Message us any time. Replies show up here and go to {user.email}.</p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-stone-900">Book a call</h2>
          {siteConfig.calendlyUrl ? (
            <>
              <p className="mt-1 text-sm text-stone-600">Pick a time that suits you and we&apos;ll walk through your report and the fixes together.</p>
              <LinkButton href={siteConfig.calendlyUrl} target="_blank" rel="noopener noreferrer" className="mt-4 w-full">
                Book a call
              </LinkButton>
            </>
          ) : (
            <p className="mt-1 text-sm text-stone-600">
              {contact?.wantsCall
                ? "You asked for a call. We'll email you to pick a time."
                : "Want to walk through your report together? Send us a message below and we'll email you to pick a time."}
            </p>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-stone-900">Your account</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div>
              <dt className="inline text-stone-500">Business: </dt>
              <dd className="inline text-stone-800">{user.business.name}</dd>
            </div>
            <div>
              <dt className="inline text-stone-500">Login: </dt>
              <dd className="inline text-stone-800">{user.email}</dd>
            </div>
            <div>
              <dt className="inline text-stone-500">Website: </dt>
              <dd className="inline text-stone-800">{user.business.website ?? "Not provided"}</dd>
            </div>
            <div>
              <dt className="inline text-stone-500">Call requested: </dt>
              <dd className="inline text-stone-800">{contact?.wantsCall ? "Yes" : "No"}</dd>
            </div>
          </dl>
          <div className="mt-3 rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">What you told us you want</p>
            <p className="mt-1 text-sm text-stone-800">{contact?.goals ?? "Nothing yet — send us a message below."}</p>
          </div>
        </Card>
      </div>

      {siteConfig.calendlyEmbedUrl && (
        <Card className="mt-6 p-2">
          <iframe src={siteConfig.calendlyEmbedUrl} title="Book a call" loading="lazy" className="h-[660px] w-full rounded-xl border-0" />
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Send us a message</h2>
        <div className="mt-4">
          <SupportMessageForm action={createSupportThreadAction} withSubject submitLabel="Send message" placeholder="What can we help with?" note="We usually reply within one business day." />
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Your conversations</h2>
        {threads.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">No messages yet. Everything you send us, and every reply, will be listed here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-200">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/support/${t.id}`} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-900">{t.subject}</p>
                    <p className="text-xs text-stone-500">
                      {t._count.messages} {t._count.messages === 1 ? "message" : "messages"} · last activity {lastActivity(t.lastMessageAt)}
                    </p>
                  </div>
                  <ThreadStatusBadge status={t.status} viewer="client" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
