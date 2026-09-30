"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notifyBusinessUsers } from "@/lib/notifications";
import { advanceScan } from "@/lib/scan/engine";
import { ActionState } from "./types";

const PUSH_TYPES = new Set(["Website FAQ/Schema update", "Press release", "Directory listing", "Knowledge profile", "Blog article"]);
const PUSH_STATUSES = new Set(["Planned", "In Progress", "Published"]);
const NOT_ADMIN: ActionState = { error: "Admin session required." };

export async function saveTruthBriefAction(businessId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return NOT_ADMIN;
  const description = String(formData.get("description") || "").trim().slice(0, 4000) || null;
  const services = String(formData.get("services") || "").trim().slice(0, 4000) || null;
  const location = String(formData.get("location") || "").trim().slice(0, 500) || null;
  const keyFacts = String(formData.get("keyFacts") || "").trim().slice(0, 8000) || null;
  const approvedSources = String(formData.get("approvedSources") || "").trim().slice(0, 8000) || null;

  await prisma.truthBrief.upsert({
    where: { businessId },
    create: { businessId, description, services, location, keyFacts, approvedSources },
    update: { description, services, location, keyFacts, approvedSources },
  });

  revalidatePath(`/admin/clients/${businessId}`);
  return { success: "Truth Brief saved." };
}

export async function createContentPushAction(businessId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return NOT_ADMIN;
  const title = String(formData.get("title") || "").trim().slice(0, 300);
  const type = String(formData.get("type") || "").trim();
  const targetChannel = String(formData.get("targetChannel") || "").trim().slice(0, 500) || null;
  const contentBody = String(formData.get("contentBody") || "").trim().slice(0, 20000) || null;
  const status = String(formData.get("status") || "Planned");

  if (!title || !type) return { error: "Title and type are required." };
  if (!PUSH_TYPES.has(type)) return { error: "Unknown content push type." };
  if (!PUSH_STATUSES.has(status)) return { error: "Unknown status." };

  await prisma.contentPush.create({
    data: { businessId, title, type, targetChannel, contentBody, status },
  });
  await notifyBusinessUsers(businessId, `New content push created: "${title}" (${status}).`);

  revalidatePath(`/admin/clients/${businessId}`);
  return { success: "Content push created." };
}

export async function updateContentPushStatusAction(pushId: string, businessId: string, formData: FormData) {
  if (!(await isAdmin())) return;
  const status = String(formData.get("status") || "");
  if (!PUSH_STATUSES.has(status)) return;
  const push = await prisma.contentPush.update({ where: { id: pushId, businessId }, data: { status } });
  await notifyBusinessUsers(businessId, `"${push.title}" status changed to ${status}.`);

  revalidatePath(`/admin/clients/${businessId}`);
  revalidatePath(`/dashboard`);
}

export async function sendNotificationAction(businessId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return NOT_ADMIN;
  const message = String(formData.get("message") || "").trim().slice(0, 2000);
  if (!message) return { error: "Message is required." };

  await notifyBusinessUsers(businessId, message);

  revalidatePath(`/admin/clients/${businessId}`);
  return { success: "Notification sent." };
}

/** Advances a stalled or running scan by one unit of work from the admin dashboard. */
export async function resumeScanAction(auditId: string) {
  if (!(await isAdmin())) return;
  try {
    await advanceScan(auditId);
  } catch (err) {
    console.error("Resume scan failed", { auditId, message: err instanceof Error ? err.message : String(err) });
  }
  revalidatePath("/admin/scans");
  revalidatePath(`/audit/${auditId}/running`);
}

/** Records a fresh health check per configured engine. */
export async function runProviderHealthAction() {
  if (!(await isAdmin())) return;
  const { getProviders } = await import("@/lib/providers/registry");
  const { recordProviderEvent } = await import("@/lib/providers/cache");
  await Promise.all(
    getProviders().map(async (p) => {
      const started = Date.now();
      const result = await p.health();
      await recordProviderEvent({ engine: p.id, kind: "health", ok: result.ok, message: result.message ?? null, latencyMs: Date.now() - started });
    })
  );
  revalidatePath("/admin/providers");
}
