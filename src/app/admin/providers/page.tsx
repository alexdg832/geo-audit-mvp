import { redirect } from "next/navigation";
import { runProviderHealthAction } from "@/lib/actions/admin";
import { isAdmin } from "@/lib/auth/session";
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
    </main>
  );
}
