"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuditStatus } from "@/lib/actions/audit";
import { AuditStep } from "@/lib/audit/types";
import type { TickResult } from "@/lib/scan/engine";

function StepIcon({ status }: { status: "pending" | "in_progress" | "done" | "failed" }) {
  if (status === "done") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-700 text-xs text-white" aria-hidden>
        ✓
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-700 text-xs text-white" aria-hidden>
        !
      </span>
    );
  }
  if (status === "in_progress") {
    return <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />;
  }
  return <span className="h-6 w-6 shrink-0 rounded-full border-2 border-stone-300" aria-hidden />;
}

const STAGES: { key: string; label: string; matches: string[] }[] = [
  { key: "site", label: "Checking your website and building the prompt set", matches: ["site", "site_running"] },
  { key: "queries", label: "Asking ChatGPT, Claude, Gemini and Perplexity", matches: ["queries"] },
  { key: "finalize", label: "Scoring the evidence and writing your report", matches: ["finalize", "finalizing"] },
];

function stageStatus(stageKey: string, current: string | null, status: string): "pending" | "in_progress" | "done" | "failed" {
  if (status === "complete") return "done";
  const order = STAGES.map((s) => s.key);
  const currentIndex = STAGES.findIndex((s) => s.matches.includes(current ?? ""));
  const index = order.indexOf(stageKey);
  if (status === "failed") return index <= currentIndex ? "failed" : "pending";
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "in_progress";
  return "pending";
}

export function ScanProgress({ auditId, initial }: { auditId: string; initial: TickResult }) {
  const [state, setState] = useState<TickResult>(initial);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(initial.status === "failed");
  const router = useRouter();
  const failures = useRef(0);
  const cancelled = useRef(false);

  const tick = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits/${auditId}/tick`, { method: "POST", cache: "no-store" });
      if (!res.ok) throw new Error(`Tick failed (${res.status})`);
      const next = (await res.json()) as TickResult;
      failures.current = 0;
      setError(null);
      return next;
    } catch (err) {
      failures.current += 1;
      setError(err instanceof Error ? err.message : "Connection problem");
      return null;
    }
  }, [auditId]);

  useEffect(() => {
    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loop = async (previous: TickResult) => {
      if (cancelled.current) return;
      const next = await tick();
      if (cancelled.current) return;
      if (!next) {
        if (failures.current >= 20) {
          setStopped(true);
          return;
        }
        timer = setTimeout(() => loop(previous), Math.min(15_000, 1_000 * 2 ** failures.current));
        return;
      }
      setState(next);
      if (next.status === "complete") {
        router.push(`/audit/${auditId}/results`);
        return;
      }
      if (next.status === "failed") {
        setStopped(true);
        return;
      }
      const progressed = JSON.stringify(next.units) !== JSON.stringify(previous.units) || next.stage !== previous.stage;
      timer = setTimeout(() => loop(next), progressed ? 250 : 2_500);
    };

    if (initial.status === "complete") {
      router.push(`/audit/${auditId}/results`);
    } else if (initial.status !== "failed") {
      void loop(initial);
    }
    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [auditId, initial, router, tick]);

  const done = state.units.complete + state.units.failed + state.units.skipped;

  return (
    <div className="space-y-6">
      <ul className="space-y-4" aria-live="polite">
        {STAGES.map((stage) => {
          const s = stageStatus(stage.key, state.stage, state.status);
          return (
            <li key={stage.key} className="flex items-center gap-3">
              <StepIcon status={s} />
              <span className={s === "done" ? "text-stone-500 line-through" : s === "in_progress" ? "font-medium text-stone-900" : "text-stone-500"}>
                {stage.label}
                {stage.key === "queries" && state.units.total > 0 && s === "in_progress" && (
                  <span className="ml-2 text-sm text-stone-500">
                    {done} of {state.units.total} checks
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {state.engines.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {state.engines.map((e) => (
            <li key={e.engine} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2">
              <span className="text-stone-800">{e.label}</span>
              <span className="text-stone-500">
                {e.status === "not_configured" ? "not configured" : e.status === "error" ? "error" : e.total ? `${e.complete}/${e.total}` : "waiting"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-stone-600" role="status">
        {state.message}
      </p>

      {state.isMock && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          Mock mode: this scan uses fixture data, not real AI engines.
        </p>
      )}

      {(error || stopped) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p>{state.status === "failed" ? state.message : error ?? "The scan stopped responding."}</p>
          <button
            type="button"
            className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-100"
            onClick={() => {
              failures.current = 0;
              setStopped(false);
              setError(null);
              router.refresh();
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

/** Progress for audits created before the scan engine; polls the legacy status action. */
export function AuditProgress({ auditId, initialSteps }: { auditId: string; initialSteps: AuditStep[] }) {
  const [steps, setSteps] = useState<AuditStep[]>(initialSteps);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      const result = await getAuditStatus(auditId);
      if (!result || cancelled) return;
      setSteps(result.steps as AuditStep[]);
      if (result.status === "complete") {
        clearInterval(interval);
        router.push(`/audit/${auditId}/results`);
      }
      if (result.status === "failed") clearInterval(interval);
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [auditId, router]);

  return (
    <ul className="space-y-4" aria-live="polite">
      {steps.map((step) => (
        <li key={step.key} className="flex items-center gap-3">
          <StepIcon status={step.status} />
          <span className={step.status === "done" ? "text-stone-500 line-through" : step.status === "in_progress" ? "font-medium text-stone-900" : "text-stone-500"}>
            {step.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
