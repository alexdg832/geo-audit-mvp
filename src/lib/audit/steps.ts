import { AuditStep, StepKey } from "./types";

export const STEP_DEFINITIONS: { key: StepKey; label: string }[] = [
  { key: "website", label: "Checking your website" },
  { key: "mentions", label: "Finding what's said about you" },
  { key: "sourceTrust", label: "Grading source trust" },
  { key: "aiReadiness", label: "Checking AI readiness" },
  { key: "score", label: "Calculating your score" },
];

export function initialSteps(): AuditStep[] {
  return STEP_DEFINITIONS.map((s) => ({ ...s, status: "pending" }));
}
