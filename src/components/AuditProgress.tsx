"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuditStatus } from "@/lib/actions/audit";
import { AuditStep } from "@/lib/audit/types";

function StepIcon({ status }: { status: AuditStep["status"] }) {
  if (status === "done") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs text-white">
        ✓
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    );
  }
  return <span className="h-6 w-6 shrink-0 rounded-full border-2 border-stone-300" />;
}

export function AuditProgress({
  auditId,
  initialSteps,
}: {
  auditId: string;
  initialSteps: AuditStep[];
}) {
  const [steps, setSteps] = useState<AuditStep[]>(initialSteps);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const interval = setInterval(async () => {
      const result = await getAuditStatus(auditId);
      if (!result || cancelled) return;
      setSteps(result.steps);
      if (result.status === "complete") {
        clearInterval(interval);
        router.push(`/audit/${auditId}/results`);
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [auditId, router]);

  return (
    <ul className="space-y-4">
      {steps.map((step) => (
        <li key={step.key} className="flex items-center gap-3">
          <StepIcon status={step.status} />
          <span
            className={
              step.status === "done"
                ? "text-stone-500 line-through"
                : step.status === "in_progress"
                  ? "font-medium text-stone-900"
                  : "text-stone-500"
            }
          >
            {step.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
