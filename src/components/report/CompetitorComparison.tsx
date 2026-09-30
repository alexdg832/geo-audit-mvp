import { Badge } from "@/components/ui/Badge";
import type { ReportData } from "@/lib/report/format";
import { Section } from "./Section";

export function CompetitorComparison({ data }: { data: ReportData }) {
  const completed = data.runs.filter((r) => r.status === "complete");
  const mine = completed.filter((r) => r.mentioned).length;
  const rows = [
    { id: "self", name: data.audit.businessName, runCount: mine, engines: Array.from(new Set(completed.filter((r) => r.mentioned).map((r) => r.engineLabel))), self: true },
    ...data.competitors.map((c) => ({
      id: c.id,
      name: c.name,
      runCount: c.runCount,
      engines: c.engines.map((e) => data.engines.find((x) => x.engine === e)?.label ?? e),
      self: false,
    })),
  ].sort((a, b) => b.runCount - a.runCount);
  const max = Math.max(1, ...rows.map((r) => r.runCount));

  return (
    <Section id="competitors" title="Who AI recommends instead" intro={`Businesses named across ${completed.length} answers. Counts are the number of answers naming each business; the Evidence Explorer shows every one.`}>
      {data.competitors.length === 0 && mine === 0 ? (
        <p className="text-sm text-stone-600">Engines named no specific businesses in these answers.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="py-1 pr-3">#</th>
              <th className="py-1 pr-3">Business</th>
              <th className="py-1 pr-3">Answers</th>
              <th className="py-1">Engines</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.slice(0, 12).map((r, i) => (
              <tr key={r.id} className={r.self ? "bg-indigo-50" : ""}>
                <td className="py-2 pr-3 text-stone-500">{i + 1}</td>
                <td className="py-2 pr-3 font-medium text-stone-900">
                  {r.name} {r.self && <Badge tone="indigo">you</Badge>}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-stone-200">
                      <div className={`h-full rounded-full ${r.self ? "bg-accent" : "bg-stone-500"}`} style={{ width: `${(r.runCount / max) * 100}%` }} />
                    </div>
                    <span className="tabular-nums">{r.runCount}</span>
                  </div>
                </td>
                <td className="py-2 text-stone-600">{r.engines.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
