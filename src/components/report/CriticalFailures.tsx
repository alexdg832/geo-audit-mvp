import { Badge } from "@/components/ui/Badge";
import type { ReportData } from "@/lib/report/load";
import { PILLARS } from "@/lib/scoring";
import { Section } from "./Section";

function evidenceSummary(e: { runIds?: string[]; citationIds?: string[]; siteCheckFields?: string[]; competitorIds?: string[]; note?: string }): string {
  const parts: string[] = [];
  if (e.runIds?.length) parts.push(`${e.runIds.length} engine answer${e.runIds.length === 1 ? "" : "s"}`);
  if (e.citationIds?.length) parts.push(`${e.citationIds.length} cited source${e.citationIds.length === 1 ? "" : "s"}`);
  if (e.siteCheckFields?.length) parts.push(`website check: ${e.siteCheckFields.join(", ")}`);
  if (e.competitorIds?.length) parts.push(`${e.competitorIds.length} competitor record${e.competitorIds.length === 1 ? "" : "s"}`);
  if (e.note) parts.push(e.note);
  return parts.join(" · ");
}

export function CriticalFailures({ data }: { data: ReportData }) {
  const failures = data.report.criticalFailures;
  return (
    <Section id="critical" title="Critical failures" intro="The highest-impact problems, in order. Every statement below is backed by a stored evidence record you can inspect in the Evidence Explorer.">
      {failures.length === 0 ? (
        <p className="text-sm text-stone-600">No critical failures. The remaining points lost are itemised in the pillar breakdown.</p>
      ) : (
        <ol className="space-y-3">
          {failures.map((f, i) => {
            const pillar = PILLARS.find((p) => p.key === f.pillar);
            const anchor = f.evidence.siteCheckFields?.length && !f.evidence.runIds?.length ? "#pillars" : f.evidence.competitorIds?.length ? "#competitors" : "#evidence";
            return (
              <li key={f.key} className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold text-red-900">
                    {i + 1}. {f.title}
                  </h3>
                  <div className="flex gap-2">
                    <Badge tone="red">−{f.pointsLost} pts</Badge>
                    {pillar && <Badge tone="neutral">{pillar.label}</Badge>}
                  </div>
                </div>
                <p className="mt-1 text-sm text-red-900/90">{f.detail}</p>
                <p className="mt-2 text-xs text-red-800/80">
                  Evidence: {evidenceSummary(f.evidence)}.{" "}
                  <a href={anchor} className="underline">
                    See it
                  </a>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
