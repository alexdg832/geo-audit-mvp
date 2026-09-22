"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { runAudit } from "@/lib/audit/runAudit";
import { initialSteps } from "@/lib/audit/steps";
import { ActionState } from "./types";

export async function startAuditAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = String(formData.get("name") || "").trim();
  const website = String(formData.get("website") || "").trim();
  const location = String(formData.get("location") || "").trim();

  if (!name) return { error: "Business name is required." };

  const business = await prisma.business.create({
    data: { name, website: website || null, location: location || null },
  });

  const audit = await prisma.audit.create({
    data: {
      businessId: business.id,
      status: "running",
      stepsJson: JSON.stringify(initialSteps()),
    },
  });

  // Fire-and-forget: the running page polls getAuditStatus for progress.
  // TODO(production): move this to a real background job queue (e.g. Vercel
  // Queues) instead of an unawaited promise, which only survives as long as
  // this Node process stays alive.
  void runAudit(audit.id).catch((err) => {
    console.error("Audit run failed", err);
  });

  redirect(`/audit/${audit.id}/running`);
}

export async function rerunAuditAction(businessId: string) {
  const audit = await prisma.audit.create({
    data: {
      businessId,
      status: "running",
      stepsJson: JSON.stringify(initialSteps()),
    },
  });

  void runAudit(audit.id).catch((err) => {
    console.error("Audit run failed", err);
  });

  redirect(`/audit/${audit.id}/running`);
}

export async function getAuditStatus(auditId: string) {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: { status: true, stepsJson: true },
  });
  if (!audit) return null;
  return { status: audit.status, steps: JSON.parse(audit.stepsJson) };
}
