import { Badge, confidenceTone } from "@/components/ui/Badge";
import type { ReportData } from "@/lib/report/load";
import { PILLARS } from "@/lib/scoring";
import { Section } from "./Section";

export function PillarBreakdown({ data }: { data: ReportData }) {
  return (
    <Section id="pillars" title="Pillar breakdown" intro="Each pillar is the sum of named sub-metrics. Every point lost names the finding that cost it.">
      <div className="space-y-6">
        {PILLARS.map((pillar) => {
          const summary = data.report.pillars.find((p) => p.key === pillar.key);
          const metrics = data.breakdowns.filter((b) => b.pillar === pillar.key);
          const score = summary?.score ?? 0;
          const pct = Math.max(0, Math.min(100, (score / pillar.weight) * 100));
          return (
            <div key={pillar.key} className="rounded-xl border border-stone-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-stone-900">{pillar.label}</h3>
                  <p className="text-xs text-stone-500">{pillar.description}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge tone={confidenceTone(summary?.confidence ?? "low")}>{summary?.confidence ?? "low"} confidence</Badge>
                  <span className="font-semibold text-stone-900">
                    {score}/{pillar.weight}
                  </span>
                </div>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={pillar.weight} aria-label={pillar.label}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <table className="mt-3 w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>Sub-metric</th>
                    <th>Points</th>
                    <th>Finding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {metrics.map((m) => (
                    <tr key={m.id} className="align-top">
                      <td className="w-44 py-2 pr-3">
                        <div className="font-medium text-stone-800">{titleFor(m.metric)}</div>
                        <div className="mt-0.5">
                          <Badge tone={m.label === "evidence-backed" ? "green" : "stone"} title={m.label === "evidence-backed" ? "Criterion supported by published research or engine documentation" : "Reasonable practice; direct evidence is limited"}>
                            {m.label}
                          </Badge>
                        </div>
                      </td>
                      <td className="w-20 py-2 pr-3 font-semibold text-stone-900">
                        {m.points}/{m.weight}
                        {m.pointsLost > 0 && <div className="text-xs font-normal text-red-700">−{m.pointsLost}</div>}
                      </td>
                      <td className="py-2 text-stone-700">{m.finding}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const TITLES: Record<string, string> = {
  mention_rate: "Mention rate",
  prominence: "Prominence when mentioned",
  engine_coverage: "Engine coverage",
  brand_recognition: "Direct brand recognition",
  citation_quality: "Trust tier of supporting sources",
  own_site_cited: "Your own site is cited",
  low_trust_dependence: "Independence from low-trust sources",
  schema_present: "Structured business data",
  schema_nap: "Name, phone, address in structured data",
  nap_on_page: "Contact details visible",
  title_meta: "Title and meta description",
  fact_accuracy: "Accuracy of AI claims",
  meta_description: "Meta description",
  h1: "Clear main heading",
  content_depth: "Enough readable text",
  hours: "Opening hours stated",
  faq: "Question-and-answer content",
  about_page: "About page",
  crawler_access: "AI crawlers allowed",
  https: "HTTPS",
  rendering: "Readable without JavaScript",
  sitemap: "XML sitemap",
  llms_txt: "llms.txt",
  speed: "Response time",
  share_of_voice: "Share of voice vs. top competitor",
  rank_vs_competitors: "Rank among businesses AI names",
};

export function titleFor(metric: string): string {
  return TITLES[metric] ?? metric.replace(/_/g, " ");
}
