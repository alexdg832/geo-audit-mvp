"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { notifyBusinessUsers } from "@/lib/notifications";
import { ActionState } from "./types";

export async function saveTruthBriefAction(
  businessId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const description = String(formData.get("description") || "").trim() || null;
  const services = String(formData.get("services") || "").trim() || null;
  const location = String(formData.get("location") || "").trim() || null;
  const keyFacts = String(formData.get("keyFacts") || "").trim() || null;
  const approvedSources = String(formData.get("approvedSources") || "").trim() || null;

  await prisma.truthBrief.upsert({
    where: { businessId },
    create: { businessId, description, services, location, keyFacts, approvedSources },
    update: { description, services, location, keyFacts, approvedSources },
  });

  revalidatePath(`/admin/clients/${businessId}`);
  return { success: "Truth Brief saved." };
}

export async function createContentPushAction(
  businessId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const title = String(formData.get("title") || "").trim();
  const type = String(formData.get("type") || "").trim();
  const targetChannel = String(formData.get("targetChannel") || "").trim() || null;
  const contentBody = String(formData.get("contentBody") || "").trim() || null;
  const status = String(formData.get("status") || "Planned");

  if (!title || !type) return { error: "Title and type are required." };

  await prisma.contentPush.create({
    data: { businessId, title, type, targetChannel, contentBody, status },
  });
  await notifyBusinessUsers(businessId, `New content push created: "${title}" (${status}).`);

  revalidatePath(`/admin/clients/${businessId}`);
  return { success: "Content push created." };
}

export async function updateContentPushStatusAction(
  pushId: string,
  businessId: string,
  formData: FormData
) {
  const status = String(formData.get("status") || "");
  const push = await prisma.contentPush.update({ where: { id: pushId }, data: { status } });
  await notifyBusinessUsers(businessId, `"${push.title}" status changed to ${status}.`);

  revalidatePath(`/admin/clients/${businessId}`);
  revalidatePath(`/dashboard`);
}

export async function sendNotificationAction(
  businessId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const message = String(formData.get("message") || "").trim();
  if (!message) return { error: "Message is required." };

  await notifyBusinessUsers(businessId, message);

  revalidatePath(`/admin/clients/${businessId}`);
  return { success: "Notification sent." };
}
