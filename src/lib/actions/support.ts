"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notifySupportMessageFromClient, notifySupportReplyFromAdmin } from "@/lib/email/notify";
import { notifyBusinessUsers } from "@/lib/notifications";
import { ActionState } from "./types";

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;
const CLIENT_MESSAGES_PER_HOUR = 20;
const THREAD_STATUSES = new Set(["open", "answered", "closed"]);
const NOT_LOGGED_IN: ActionState = { error: "Please log in to send a message." };
const TOO_MANY: ActionState = { error: "You have sent a lot of messages in the last hour. Please wait a little before sending more." };

function cleanSubject(raw: FormDataEntryValue | null): string {
  return String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SUBJECT_MAX);
}

function cleanBody(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").replace(/\r\n/g, "\n").trim().slice(0, BODY_MAX);
}

async function clientOverCap(businessId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.supportMessage.count({ where: { author: "client", createdAt: { gt: since }, thread: { businessId } } });
  return count >= CLIENT_MESSAGES_PER_HOUR;
}

/** Email goes out after the response; a delivery problem never fails the action. */
function queueEmail(task: () => Promise<void>, label: string): void {
  after(async () => {
    try {
      await task();
    } catch (err) {
      console.error(`${label} email failed`, { message: err instanceof Error ? err.message : String(err) });
    }
  });
}

export async function createSupportThreadAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED_IN;
  const subject = cleanSubject(formData.get("subject"));
  const body = cleanBody(formData.get("message"));
  if (!subject) return { error: "Please add a short subject." };
  if (!body) return { error: "Please write a message." };
  if (await clientOverCap(user.businessId)) return TOO_MANY;

  const thread = await prisma.supportThread.create({
    data: { businessId: user.businessId, subject, messages: { create: { author: "client", authorName: user.email, body } } },
    include: { messages: { select: { id: true } } },
  });
  const messageId = thread.messages[0]?.id;
  if (messageId) queueEmail(() => notifySupportMessageFromClient(messageId, true), "Support message");

  revalidatePath("/dashboard/support");
  revalidatePath("/dashboard");
  return { success: "Message sent. We'll reply here and by email.", nonce: Date.now() };
}

export async function replyToSupportThreadAction(threadId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return NOT_LOGGED_IN;
  const thread = await prisma.supportThread.findFirst({ where: { id: threadId, businessId: user.businessId }, select: { id: true } });
  if (!thread) return { error: "Conversation not found." };
  const body = cleanBody(formData.get("message"));
  if (!body) return { error: "Please write a message." };
  if (await clientOverCap(user.businessId)) return TOO_MANY;

  const message = await prisma.supportMessage.create({ data: { threadId, author: "client", authorName: user.email, body } });
  await prisma.supportThread.update({ where: { id: threadId }, data: { status: "open", lastMessageAt: message.createdAt } });
  queueEmail(() => notifySupportMessageFromClient(message.id, false), "Support reply");

  revalidatePath(`/dashboard/support/${threadId}`);
  revalidatePath("/dashboard/support");
  return { success: "Reply sent.", nonce: Date.now() };
}

export async function adminReplyToThreadAction(threadId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: "Admin session required." };
  const thread = await prisma.supportThread.findUnique({ where: { id: threadId }, select: { id: true, businessId: true, subject: true } });
  if (!thread) return { error: "Conversation not found." };
  const body = cleanBody(formData.get("message"));
  if (!body) return { error: "Please write a reply." };

  const message = await prisma.supportMessage.create({ data: { threadId, author: "admin", authorName: "TrueSource", body } });
  await prisma.supportThread.update({ where: { id: threadId }, data: { status: "answered", lastMessageAt: message.createdAt } });
  await notifyBusinessUsers(thread.businessId, `We replied to your message "${thread.subject}".`);
  queueEmail(() => notifySupportReplyFromAdmin(message.id), "Support reply");

  revalidatePath(`/admin/support/${threadId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/dashboard/support/${threadId}`);
  revalidatePath("/dashboard/support");
  revalidatePath("/dashboard");
  return { success: "Reply sent to the client.", nonce: Date.now() };
}

export async function setSupportThreadStatusAction(threadId: string, status: string): Promise<void> {
  if (!(await isAdmin())) return;
  if (!THREAD_STATUSES.has(status)) return;
  await prisma.supportThread.update({ where: { id: threadId }, data: { status } });
  revalidatePath(`/admin/support/${threadId}`);
  revalidatePath("/admin/support");
  revalidatePath("/dashboard/support");
}
