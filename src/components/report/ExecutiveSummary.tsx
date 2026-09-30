import { ScoreGauge } from "@/components/ScoreGauge";
import { Badge, confidenceTone } from "@/components/ui/Badge";
import type { ReportData } from "@/lib/report/load";
import { Section } from "./Section";

export function ExecutiveSummary({ data }: { data: ReportData }) {
  const { report, audit, runs, engines } = data;
  const completed = runs.filter((r) => r.status === "complete");
  const mentioned = completed.filter((r) => r.mentioned);
  const live = engines.filter((e) => e.status === "live");
  const notConfigured = engines.filter((e) => e.status === "not_configured");
  const errored = engines.filter((e) => e.status === "error");

  return (
    <Section id="summary" title="Executive summary">
      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start">
        <div className="shrink-0">
          <ScoreGauge score={report.score} grade={report.grade} />
          <p className="mt-2 text-center text-xs text-stone-500">
            Confidence: <Badge tone={confidenceTone(report.confidence)}>{report.confidence}</Badge>
          </p>
        </div>
        <div className="space-y-4">
          <p className="text-base leading-relaxed text-stone-800">{report.verdict}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Engines live" value={`${live.length}`} note={live.map((e) => e.label).join(", ") || "none"} />
            <Stat label="Answers collected" value={`${completed.length}`} note={`${data.prompts.length} prompts × ${audit.runsPerPrompt} runs`} />
            <Stat label="Answers naming you" value={`${mentioned.length}`} note={completed.length ? `${Math.round((mentioned.length / completed.length) * 100)}% of answers` : "—"} />
            <Stat label="Sources traced" value={`${runs.reduce((s, r) => s + r.citations.length, 0)}`} note={`${runs.filter((r) => r.status === "complete" && r.noCitations).length} answers gave none`} />
          </dl>
          {(notConfigured.length > 0 || errored.length > 0) && (
            <p className="text-xs text-stone-500">
              {notConfigured.length > 0 && <>Not scanned (no key configured): {notConfigured.map((e) => e.label).join(", ")}. </>}
              {errored.length > 0 && <>Failed during this scan: {errored.map((e) => e.label).join(", ")}.</>}
            </p>
          )}
          {report.caps.length > 0 && (
            <ul className="space-y-1 text-sm text-red-800">
              {report.caps.map((c) => (
                <li key={c.key} className="rounded-lg bg-red-50 px-3 py-2">
                  <span className="font-semibold">Score capped at {c.ceiling}:</span> {c.reason}
                </li>
              ))}
            </ul>
          )}
          {audit.ambiguity && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold">Name clash:</span> {audit.ambiguity} Check the Evidence Explorer for which answers refer to someone else.
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-stone-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-xl font-bold text-stone-900">{value}</dd>
      <dd className="text-xs text-stone-500">{note}</dd>
    </div>
  );
}
