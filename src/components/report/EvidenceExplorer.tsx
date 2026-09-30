"use client";

import { useMemo, useState } from "react";
import { Badge, tierTone } from "@/components/ui/Badge";
import type { CitationView, RunView } from "@/lib/report/load";
import { safeHref } from "@/lib/report/load";
import { promptKindLabel } from "@/lib/scan/prompts";

interface Segment {
  start: number;
  end: number;
  citations: number[];
  mention: boolean;
}

function buildSegments(text: string, citations: CitationView[], mention: { start: number | null; end: number | null }): Segment[] {
  const bounds = new Set<number>([0, text.length]);
  citations.forEach((c) => {
    if (c.passageStart !== null && c.passageEnd !== null) {
      bounds.add(Math.max(0, Math.min(text.length, c.passageStart)));
      bounds.add(Math.max(0, Math.min(text.length, c.passageEnd)));
    }
  });
  if (mention.start !== null && mention.end !== null) {
    bounds.add(mention.start);
    bounds.add(mention.end);
  }
  const sorted = Array.from(bounds).sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const covering = citations
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => c.passageStart !== null && c.passageEnd !== null && c.passageStart <= start && c.passageEnd >= end)
      .map(({ idx }) => idx);
    const inMention = mention.start !== null && mention.end !== null && mention.start <= start && mention.end >= end;
    segments.push({ start, end, citations: covering, mention: inMention });
  }
  return segments;
}

function Answer({ run, active, onHover }: { run: RunView; active: number | null; onHover: (i: number | null) => void }) {
  const text = run.answerText ?? "";
  const segments = useMemo(() => buildSegments(text, run.citations, { start: run.mentionStart, end: run.mentionEnd }), [text, run.citations, run.mentionStart, run.mentionEnd]);
  return (
    <div className="whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-sm leading-relaxed text-stone-800">
      {segments.map((seg) => {
        const slice = text.slice(seg.start, seg.end);
        const isActive = active !== null && seg.citations.includes(active);
        const classes = [
          seg.mention ? "rounded bg-indigo-200 px-0.5 font-semibold text-stone-900" : "",
          seg.citations.length && !seg.mention ? "rounded bg-amber-100 px-0.5" : "",
          isActive ? "ring-2 ring-amber-500" : "",
        ]
          .filter(Boolean)
          .join(" ");
        if (!classes) return <span key={seg.start}>{slice}</span>;
        return (
          <mark
            key={seg.start}
            className={classes}
            title={seg.citations.length ? `Supported by source ${seg.citations.map((i) => i + 1).join(", ")}` : "Mention of your business"}
            onMouseEnter={() => seg.citations.length && onHover(seg.citations[0])}
            onMouseLeave={() => onHover(null)}
          >
            {slice}
            {seg.citations.length > 0 && <sup className="ml-0.5 text-[10px] text-amber-800">{seg.citations.map((i) => i + 1).join(",")}</sup>}
          </mark>
        );
      })}
    </div>
  );
}

function RunCard({ run, businessName }: { run: RunView; businessName: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const sentimentTone = run.sentiment === "positive" ? "green" : run.sentiment === "negative" ? "red" : run.sentiment === "mixed" ? "amber" : "neutral";
  const accuracyTone = run.accuracy === "accurate" ? "green" : run.accuracy === "inaccurate" ? "red" : "neutral";
  return (
    <article className="rounded-xl border border-stone-200 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold text-stone-900">{run.engineLabel}</span>
          {run.model && <span className="text-stone-500"> · {run.model}</span>}
          <span className="text-stone-500"> · run {run.runIndex + 1}</span>
          {run.completedAt && <span className="text-stone-500"> · {new Date(run.completedAt).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC</span>}
          {run.latencyMs !== null && <span className="text-stone-500"> · {run.latencyMs} ms</span>}
          {run.cached && <span className="text-stone-500"> · cached same-day</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {run.status !== "complete" ? (
            <Badge tone="red">{run.status}</Badge>
          ) : run.mentioned ? (
            <>
              <Badge tone="indigo">mentioned{run.mentionPosition ? ` · #${run.mentionPosition}` : ""}</Badge>
              {run.sentiment && run.sentiment !== "not_applicable" && <Badge tone={sentimentTone}>{run.sentiment}</Badge>}
              {run.accuracy && run.accuracy !== "not_applicable" && <Badge tone={accuracyTone}>{run.accuracy}</Badge>}
            </>
          ) : (
            <Badge tone="red">not mentioned</Badge>
          )}
        </div>
      </header>
      <p className="mt-2 text-xs text-stone-500">
        <span className="font-medium text-stone-600">Prompt:</span> {run.promptText}
      </p>

      {run.status === "complete" && run.answerText ? (
        <div className="mt-3">
          <div className={open ? "" : "max-h-48 overflow-hidden"}>
            <Answer run={run} active={active} onHover={setActive} />
          </div>
          {(run.answerText.length > 600) && (
            <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-xs font-medium text-accent hover:underline">
              {open ? "Show less" : "Show full answer"}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">{run.error ? `This check failed: ${run.error}` : "No answer recorded."}</p>
      )}

      {run.accuracyNotes && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-900">
          <span className="font-semibold">Conflicts with your facts:</span> {run.accuracyNotes}
        </p>
      )}

      {run.status === "complete" && (
        <div className="mt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sources</h4>
          {run.noCitations ? (
            <p className="mt-1 text-sm text-stone-600">No source provided by this engine.</p>
          ) : (
            <ol className="mt-1 space-y-1.5">
              {run.citations.map((c, i) => {
                const href = safeHref(c.url);
                return (
                  <li key={c.id} className={`flex flex-wrap items-start gap-2 rounded-lg px-2 py-1 text-sm ${active === i ? "bg-amber-50" : ""}`} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
                    <span className="w-5 shrink-0 text-xs text-stone-500">{i + 1}.</span>
                    <Badge tone={tierTone(c.tier)} title={c.tierReason ?? undefined}>
                      Tier {c.tier}{c.isBusinessOwned ? " · yours" : ""}
                    </Badge>
                    <span className="min-w-0 flex-1 break-words">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          {c.title || c.domain}
                        </a>
                      ) : (
                        <span>{c.title || c.domain}</span>
                      )}
                      <span className="text-stone-500"> · {c.domain}</span>
                      {c.passageText === null && c.citedText === null && <span className="text-xs text-stone-400"> · no passage span from this engine</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {run.competitors.length > 0 && (
        <p className="mt-3 text-xs text-stone-600">
          <span className="font-medium">Other businesses named:</span> {run.competitors.map((c) => `${c.name} (#${c.position})`).join(", ")}
          {!run.mentioned && <span> — instead of {businessName}.</span>}
        </p>
      )}
    </article>
  );
}

export function EvidenceExplorer({ runs, prompts, engines, businessName }: { runs: RunView[]; prompts: { id: string; index: number; kind: string; text: string }[]; engines: { engine: string; label: string; status: string }[]; businessName: string }) {
  const [engine, setEngine] = useState<string>("all");
  const [promptId, setPromptId] = useState<string>("all");
  const [onlyMentioned, setOnlyMentioned] = useState(false);

  const filtered = runs.filter((r) => (engine === "all" || r.engine === engine) && (promptId === "all" || r.promptId === promptId) && (!onlyMentioned || r.mentioned));
  const selectClass = "rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-stone-600">Engine</span>
          <select value={engine} onChange={(e) => setEngine(e.target.value)} className={selectClass}>
            <option value="all">All engines</option>
            {engines.filter((e) => e.status === "live" || e.status === "error").map((e) => (
              <option key={e.engine} value={e.engine}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-stone-600">Prompt</span>
          <select value={promptId} onChange={(e) => setPromptId(e.target.value)} className={`${selectClass} max-w-xs`}>
            <option value="all">All prompts</option>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.index + 1}. [{promptKindLabel(p.kind as never)}] {p.text.slice(0, 70)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyMentioned} onChange={(e) => setOnlyMentioned(e.target.checked)} className="h-4 w-4 rounded border-stone-300" />
          <span className="text-stone-600">Only answers that mention {businessName}</span>
        </label>
        <span className="ml-auto text-xs text-stone-500">
          {filtered.length} of {runs.length} answers
        </span>
      </div>
      <p className="text-xs text-stone-500">
        <mark className="rounded bg-indigo-200 px-1">Highlighted</mark> passages name your business; <mark className="rounded bg-amber-100 px-1">shaded</mark> passages are the text each numbered source supports. Hover a source to see what it backs.
      </p>
      <div className="space-y-4">
        {filtered.map((run) => (
          <RunCard key={run.id} run={run} businessName={businessName} />
        ))}
        {filtered.length === 0 && <p className="text-sm text-stone-600">No answers match these filters.</p>}
      </div>
    </div>
  );
}
