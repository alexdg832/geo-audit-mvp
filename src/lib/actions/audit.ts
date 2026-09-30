"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { createSignedToken } from "@/lib/auth/signedToken";
import { prisma } from "@/lib/db";
import { notifyAdminAuditStarted } from "@/lib/email/notify";
import { hashClientIp } from "@/lib/providers/limits";
import { advanceScan, checkRerunCooldown, checkScanRateLimit, createScan, sanitizeInlineText } from "@/lib/scan/engine";
import { normalizeWebsiteUrl } from "@/lib/scan/fetcher";
import { ActionState } from "./types";

const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function claimCookieName(auditId: string): Promise<string> {
  return `geo_claim_${auditId}`;
}

async function issueClaimCookie(auditId: string): Promise<void> {
  const store = await cookies();
  store.set(await claimCookieName(auditId), createSignedToken({ auditId }, CLAIM_TTL_MS), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CLAIM_TTL_MS / 1000,
  });
}

async function requesterIpHash(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]?.trim() : h.get("x-real-ip");
  return hashClientIp(ip);
}

function kickFirstTick(auditId: string): void {
  after(async () => {
    try {
      await advanceScan(auditId);
    } catch (err) {
      console.error("First scan tick failed", { auditId, message: err instanceof Error ? err.message : String(err) });
    }
  });
}

/** Team alert for the very first form a visitor fills in; sent after the redirect. */
function queueAuditStartedEmail(auditId: string, rerun: boolean): void {
  after(async () => {
    try {
      await notifyAdminAuditStarted(auditId, rerun);
    } catch (err) {
      console.error("Audit-started email failed", { auditId, message: err instanceof Error ? err.message : String(err) });
    }
  });
}

export async function startAuditAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  // Name and location end up in email subjects, so line breaks and tabs are stripped here.
  const name = sanitizeInlineText(String(formData.get("name") || ""), 200);
  const websiteInput = String(formData.get("website") || "").trim().slice(0, 2048);
  const location = sanitizeInlineText(String(formData.get("location") || ""), 200);

  if (!name) return { error: "Business name is required." };
  const website = websiteInput ? normalizeWebsiteUrl(websiteInput) : null;
  if (websiteInput && !website) return { error: "That website address doesn't look valid." };

  const ipHash = await requesterIpHash();
  const limited = await checkScanRateLimit(ipHash);
  if (limited) return { error: limited };

  let auditId: string;
  try {
    const business = await prisma.business.create({
      data: { name, website: website ?? null, location: location || null },
    });
    ({ auditId } = await createScan({
      businessId: business.id,
      name,
      website,
      location: location || null,
      requesterIpHash: ipHash,
    }));
  } catch (err) {
    // A raw database error can name the host or schema; the visitor only needs to know to retry.
    console.error("Start audit failed", { message: err instanceof Error ? err.message : String(err) });
    return { error: "Could not start the audit. Please try again in a moment." };
  }

  await issueClaimCookie(auditId);
  queueAuditStartedEmail(auditId, false);
  kickFirstTick(auditId);
  redirect(`/audit/${auditId}/running`);
}

type RerunOutcome = { error: string } | { auditId: string };

/** Shared re-run path: ownership, the in-flight check, then the same limits as a fresh start plus a per-business cooldown. */
async function startRerun(businessId: string): Promise<RerunOutcome> {
  const user = await getCurrentUser();
  const admin = await isAdmin();
  if (!admin && (!user || user.businessId !== businessId)) redirect("/login");

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) redirect("/dashboard");

  const inFlight = await prisma.audit.findFirst({
    where: { businessId, status: "running" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (inFlight) redirect(`/audit/${inFlight.id}/running`);

  const ipHash = await requesterIpHash();
  // Every scan spends paid provider calls and counts against the global hourly ceiling, so a
  // client account is limited like an anonymous start. Admins re-scan on a client's behalf.
  if (!admin) {
    const limited = (await checkScanRateLimit(ipHash)) ?? (await checkRerunCooldown(businessId));
    if (limited) return { error: limited };
  }

  const { auditId } = await createScan({
    businessId,
    name: business.name,
    website: business.website ? normalizeWebsiteUrl(business.website) : null,
    location: business.location,
    requesterIpHash: ipHash,
  });
  queueAuditStartedEmail(auditId, true);
  kickFirstTick(auditId);
  return { auditId };
}

/** Re-run from a `useActionState` form: a refusal comes back as the form error instead of a redirect. */
export async function rerunAuditFormAction(businessId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  void _prevState;
  void _formData;
  const outcome = await startRerun(businessId);
  if ("error" in outcome) return { error: outcome.error };
  redirect(`/audit/${outcome.auditId}/running`);
}

/** Plain `<form action>` variant for the dashboard; a refusal returns there with the reason in the query string. */
export async function rerunAuditAction(businessId: string): Promise<void> {
  const outcome = await startRerun(businessId);
  if ("error" in outcome) redirect(`/dashboard?error=${encodeURIComponent(outcome.error)}`);
  redirect(`/audit/${outcome.auditId}/running`);
}

/** Legacy status poll for audits created before the scan engine. */
export async function getAuditStatus(auditId: string) {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: { status: true, stepsJson: true },
  });
  if (!audit) return null;
  let steps: unknown = [];
  try {
    steps = JSON.parse(audit.stepsJson);
  } catch {
    steps = [];
  }
  return { status: audit.status, steps };
}
