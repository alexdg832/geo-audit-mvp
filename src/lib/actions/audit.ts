"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { createSignedToken } from "@/lib/auth/signedToken";
import { prisma } from "@/lib/db";
import { notifyAdminAuditStarted } from "@/lib/email/notify";
import { hashClientIp } from "@/lib/providers/limits";
import { advanceScan, checkScanRateLimit, createScan } from "@/lib/scan/engine";
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
  const name = String(formData.get("name") || "").trim().slice(0, 200);
  const websiteInput = String(formData.get("website") || "").trim().slice(0, 2048);
  const location = String(formData.get("location") || "").trim().slice(0, 200);

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
    return { error: err instanceof Error ? err.message : "Could not start the audit." };
  }

  await issueClaimCookie(auditId);
  queueAuditStartedEmail(auditId, false);
  kickFirstTick(auditId);
  redirect(`/audit/${auditId}/running`);
}

export async function rerunAuditAction(businessId: string) {
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

  const { auditId } = await createScan({
    businessId,
    name: business.name,
    website: business.website ? normalizeWebsiteUrl(business.website) : null,
    location: business.location,
    requesterIpHash: await requesterIpHash(),
  });
  queueAuditStartedEmail(auditId, true);
  kickFirstTick(auditId);
  redirect(`/audit/${auditId}/running`);
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
