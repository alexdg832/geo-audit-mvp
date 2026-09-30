import { Badge } from "@/components/ui/Badge";
import type { ReportData } from "@/lib/report/format";
import { CAP_DEFINITIONS, GRADE_BANDS, PILLARS, SCORING_VERSION } from "@/lib/scoring";
import { Section } from "./Section";
import { titleFor } from "./PillarBreakdown";

export function HowWeScore({ data }: { data: ReportData }) {
  const bands = [...GRADE_BANDS].sort((a, b) => a.min - b.min);
  return (
    <Section id="methodology" title="How we score" intro={`Scoring version ${data.audit.scoringVersion ?? SCORING_VERSION}, stored with this report so it can be reproduced exactly.`}>
      <div className="space-y-6 text-sm text-stone-700">
        <div>
          <h3 className="font-semibold text-stone-900">What we measure</h3>
          <p className="mt-1">
            We asked {data.engines.filter((e) => e.status === "live").length} AI engine{data.engines.filter((e) => e.status === "live").length === 1 ? "" : "s"} the {data.prompts.length} questions a customer would ask about a {data.audit.category ?? "business"}
            {data.audit.location ? ` in ${data.audit.location}` : ""}, {data.audit.runsPerPrompt} times each because AI answers vary between runs. We recorded every answer, every cited source and the exact passage each source supports, then fetched your website and checked how AI crawlers can read it.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-stone-900">Pillars and weights</h3>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="py-1 pr-3">Pillar</th>
                <th className="py-1 pr-3">Weight</th>
                <th className="py-1">Sub-metrics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 align-top">
              {PILLARS.map((p) => {
                const metrics = data.breakdowns.filter((b) => b.pillar === p.key);
                return (
                  <tr key={p.key}>
                    <td className="py-2 pr-3 font-medium text-stone-800">{p.label}</td>
                    <td className="py-2 pr-3">{p.weight}</td>
                    <td className="py-2">
                      <ul className="space-y-1">
                        {metrics.map((m) => (
                          <li key={m.id} className="flex flex-wrap items-center gap-2">
                            <span>
                              {titleFor(m.metric)} ({m.weight} pts)
                            </span>
                            <Badge tone={m.label === "evidence-backed" ? "green" : "stone"}>{m.label}</Badge>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-stone-500">
            <Badge tone="green">evidence-backed</Badge> criteria are supported by published studies or the engines&apos; own documentation; <Badge tone="stone">heuristic</Badge> criteria are sound practice where direct evidence is limited. Each sub-metric is normalised to 0–1, multiplied by its weight, and summed.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-stone-900">Repeated runs and confidence</h3>
          <p className="mt-1">
            For each engine and prompt we take the median across repeated runs. When repeated runs disagree often, when few engines were live, or when a website check could not complete, the affected pillar&apos;s confidence is lowered and shown next to its score.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-stone-900">Hard caps</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {CAP_DEFINITIONS.map((c) => (
              <li key={c.key}>
                Score cannot exceed <strong>{c.ceiling}</strong> when: {c.description}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-stone-900">Grade bands</h3>
          <ul className="mt-1 flex flex-wrap gap-2">
            {bands.map((b, i) => (
              <li key={b.grade} className="rounded-lg bg-stone-50 px-3 py-1">
                <strong>{b.grade}</strong> {b.min}–{i + 1 < bands.length ? bands[i + 1].min - 1 : 100}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-stone-900">Source trust tiers</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li><strong>Tier 1</strong> — your own website and pages you control.</li>
            <li><strong>Tier 2</strong> — government, major news, encyclopedias, industry bodies and established maps/directories.</li>
            <li><strong>Tier 3</strong> — review platforms, general directories and other third-party sites.</li>
            <li><strong>Tier 4</strong> — forums, social media, free blog hosts and complaint sites.</li>
          </ul>
        </div>

        <p className="text-xs text-stone-500">
          What we do not do: we never invent a citation. When an engine gives no source, the report says so, and that absence counts against the Source Authority pillar. Fixture data (mock mode) is never used for a customer report.
        </p>
      </div>
    </Section>
  );
}
