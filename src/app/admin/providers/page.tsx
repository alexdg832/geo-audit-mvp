import { redirect } from "next/navigation";
import { runProviderHealthAction } from "@/lib/actions/admin";
import { isAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { appUrl, emailConfig } from "@/lib/email/transport";
import { isMockMode, listProviderStatus } from "@/lib/providers/registry";
import { AdminNav } from "@/components/AdminNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

function when(d: Date | null): string {
  return d ? d.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : "—";
}

export default async function AdminProvidersPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const providers = await listProviderStatus();
  const mock = isMockMode();
  const email = emailConfig();
  const emailEvents = await prisma.emailEvent.findMany({ orderBy: { createdAt: "desc" }, take: 15 });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AdminNav title="Provider status" />
      <p className="mb-6 text-stone-600">Which AI engines are live, which are missing a key, and the last error each one reported. Keys are read server-side from the environment and never shown here.</p>

      {mock && (
        <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          MOCK_MODE is on: scans use fixture data. Real engines are not called.
        </p>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="py-1 pr-3">Engine</th>
              <th className="py-1 pr-3">Status</th>
              <th className="py-1 pr-3">Model</th>
              <th className="py-1 pr-3">Key</th>
              <th className="py-1">Last result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 align-top">
            {providers.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-3 font-medium text-stone-900">{p.label}</td>
                <td className="py-2 pr-3">
                  <Badge tone={p.status === "live" ? "green" : p.status === "error" ? "red" : "stone"}>{p.status.replace("_", " ")}</Badge>
                </td>
                <td className="py-2 pr-3 text-stone-700">{p.model ?? "—"}</td>
                <td className="py-2 pr-3 font-mono text-xs text-stone-600">{p.keyEnv}</td>
                <td className="py-2 text-xs text-stone-600">
                  {p.lastOkAt && <div>OK: {when(p.lastOkAt)}</div>}
                  {p.lastError ? (
                    <div className="text-red-700">
                      Error {when(p.lastErrorAt)}: {p.lastError}
                    </div>
                  ) : (
                    <div>No errors recorded</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={runProviderHealthAction} className="mt-4">
          <Button type="submit" variant="secondary">
            Run health checks
          </Button>
          <p className="mt-1 text-xs text-stone-500">Makes one minimal request per configured engine and records the outcome.</p>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Email delivery (Resend)</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">API key</dt>
            <dd>
              <Badge tone={email.configured ? "green" : "stone"}>{email.configured ? "configured" : "not configured"}</Badge>{" "}
              <span className="font-mono text-xs text-stone-600">RESEND_API_KEY</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Team inbox</dt>
            <dd>
              <Badge tone={email.adminInbox ? "green" : "amber"}>{email.adminInbox ?? "not set"}</Badge>{" "}
              <span className="font-mono text-xs text-stone-600">ADMIN_NOTIFY_EMAIL</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Sender</dt>
            <dd className="text-stone-800">{email.from}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Links in emails point to</dt>
            <dd className="text-stone-800">{appUrl()}</dd>
          </div>
        </dl>
        {email.sandboxSender && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Sandbox sender in use. Resend only delivers from <span className="font-mono">onboarding@resend.dev</span> to the address that owns the Resend account, so client emails will fail until you verify a domain at resend.com/domains and set <span className="font-mono">RESEND_FROM_EMAIL</span>.
          </p>
        )}
        <h3 className="mt-5 text-sm font-semibold text-stone-900">Last {emailEvents.length} emails</h3>
        {emailEvents.length === 0 ? (
          <p className="mt-1 text-sm text-stone-500">Nothing sent yet.</p>
        ) : (
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wide text-stone-500">
                <th className="py-1 pr-3">When</th>
                <th className="py-1 pr-3">Kind</th>
                <th className="py-1 pr-3">To</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 align-top">
              {emailEvents.map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-stone-500">{when(e.createdAt)}</td>
                  <td className="py-1.5 pr-3 font-mono text-stone-700">{e.kind}</td>
                  <td className="py-1.5 pr-3 text-stone-700">{e.to}</td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={e.status === "sent" ? "green" : e.status === "failed" ? "red" : "stone"}>{e.status}</Badge>
                  </td>
                  <td className="py-1.5 text-stone-600">{e.error ?? e.subject}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </main>
  );
}
