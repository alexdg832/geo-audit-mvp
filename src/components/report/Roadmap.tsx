import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import type { ReportData } from "@/lib/report/format";
import { PILLARS } from "@/lib/scoring";
import { Section } from "./Section";

export function Roadmap({ data, unlocked }: { data: ReportData; unlocked: boolean }) {
  const items = data.report.roadmap;
  const recoverable = items.reduce((s, i) => s + i.pointsRecoverable, 0);
  return (
    <Section id="roadmap" title="Prioritised fix roadmap" intro={`${items.length} problems ranked by the points they cost you, worth ${Math.round(recoverable)} points in total. The problems and their priority are shown in full; the step-by-step fixes are part of the engagement.`}>
      <ol className="space-y-3">
        {items.map((item) => {
          const pillar = PILLARS.find((p) => p.key === item.pillar);
          return (
            <li key={item.key} className="rounded-xl border border-stone-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold text-stone-900">
                  {item.priority}. {item.title}
                </h3>
                <div className="flex gap-2">
                  <Badge tone="indigo">+{item.pointsRecoverable} pts</Badge>
                  <Badge tone={item.effort === "low" ? "green" : item.effort === "medium" ? "amber" : "red"}>{item.effort} effort</Badge>
                  {pillar && <Badge tone="neutral">{pillar.label}</Badge>}
                </div>
              </div>
              {unlocked ? (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-stone-700">
                  {item.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              ) : (
                <div className="relative mt-2 overflow-hidden rounded-lg">
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-400 blur-[3px] select-none" aria-hidden>
                    <li>Detailed step one for this fix, with the exact change to make.</li>
                    <li>Detailed step two, including where and how to verify it.</li>
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!unlocked && (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl bg-stone-50 p-5 text-center">
          <p className="text-sm text-stone-700">The detailed fix steps for every item above are unlocked when you work with us.</p>
          <LinkButton href={`/audit/${data.audit.id}/contact`} className="w-full max-w-xs">
            Fix this with us
          </LinkButton>
        </div>
      )}
    </Section>
  );
}
