"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
const NOT_FOUND: ActionState = { error: "Conversation not found." };
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

/**
 * Inserts a message and moves the thread's status/lastMessageAt in ONE write, so the two can never disagree (a message
 * without its status change would hide the thread from the "Needs reply" inbox and the client's "reply waiting" banner).
 * `where` may carry businessId next to id, which keeps a client's write scoped to their own business.
 * Returns the new message id, or null when the thread does not exist for that `where`.
 */
async function appendMessage(
  where: Prisma.SupportThreadWhereUniqueInput,
  message: { author: "client" | "admin"; authorName: string; body: string },
  status: "open" | "answered"
): Promise<string | null> {
  const now = new Date();
  // The id is chosen here rather than read back, so two messages in the same millisecond can never be confused.
  const id = randomUUID();
  try {
    await prisma.supportThread.update({
      where,
      data: { status, lastMessageAt: now, messages: { create: { id, ...message, createdAt: now } } },
      select: { id: true },
    });
    return id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
    throw err;
  }
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
  const body = cleanBody(formData.get("message"));
  if (!body) return { error: "Please write a message." };
  if (await clientOverCap(user.businessId)) return TOO_MANY;

  const messageId = await appendMessage({ id: threadId, businessId: user.businessId }, { author: "client", authorName: user.email, body }, "open");
  if (!messageId) return NOT_FOUND;
  queueEmail(() => notifySupportMessageFromClient(messageId, false), "Support reply");

  revalidatePath(`/dashboard/support/${threadId}`);
  revalidatePath("/dashboard/support");
  return { success: "Reply sent.", nonce: Date.now() };
}

export async function adminReplyToThreadAction(threadId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { error: "Admin session required." };
  const thread = await prisma.supportThread.findUnique({ where: { id: threadId }, select: { id: true, businessId: true, subject: true } });
  if (!thread) return NOT_FOUND;
  const body = cleanBody(formData.get("message"));
  if (!body) return { error: "Please write a reply." };

  const messageId = await appendMessage({ id: threadId }, { author: "admin", authorName: "TrueSource", body }, "answered");
  if (!messageId) return NOT_FOUND;
  await notifyBusinessUsers(thread.businessId, `We replied to your message "${thread.subject}".`);
  queueEmail(() => notifySupportReplyFromAdmin(messageId), "Support reply");

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
  // updateMany: a thread removed underneath the admin (seed reset, cascade delete) is a no-op instead of a P2025 crash.
  await prisma.supportThread.updateMany({ where: { id: threadId }, data: { status } });
  revalidatePath(`/admin/support/${threadId}`);
  revalidatePath("/admin/support");
  revalidatePath("/dashboard/support");
}
