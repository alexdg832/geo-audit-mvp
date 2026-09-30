import { siteConfig } from "@config/site";
import { prisma } from "@/lib/db";
import { sendAdminEmail, sendEmail } from "./send";
import {
  adminAuditStartedEmail,
  adminNewLeadEmail,
  adminSupportMessageEmail,
  clientSupportReceiptEmail,
  clientSupportReplyEmail,
  clientWelcomeEmail,
} from "./templates";
import { appUrl, emailConfig, type EmailStatus } from "./transport";

/** Team alert when a visitor starts (or a client re-runs) an audit. */
export async function notifyAdminAuditStarted(auditId: string, rerun: boolean): Promise<void> {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: { businessId: true, business: { select: { name: true, website: true, location: true } } },
  });
  if (!audit) return;
  const content = adminAuditStartedEmail({
    businessName: audit.business.name,
    website: audit.business.website,
    location: audit.business.location,
    auditId,
    rerun,
    appUrl: appUrl(),
  });
  await sendAdminEmail({ kind: "admin_audit_started", ...content, idempotencyKey: `audit-${auditId}`, businessId: audit.businessId });
}

/** Team alert plus a welcome email when the first form (account creation) is completed. */
export async function notifyNewLead(userId: string, auditId: string, wantsCall: boolean): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { business: true, contactRequests: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!user) return;
  const audit = await prisma.audit.findUnique({ where: { id: auditId }, select: { score: true, report: { select: { grade: true } } } });
  const contact = user.contactRequests[0] ?? null;
  const base = appUrl();
  const { adminInbox } = emailConfig();
  const score = audit?.score ?? null;
  const grade = audit?.report?.grade ?? null;

  const lead = adminNewLeadEmail({
    businessName: user.business.name,
    businessId: user.businessId,
    email: user.email,
    name: contact?.name ?? null,
    goals: contact?.goals ?? null,
    wantsCall,
    score,
    grade,
    auditId,
    appUrl: base,
  });
  const welcome = clientWelcomeEmail({
    businessName: user.business.name,
    wantsCall,
    calendlyUrl: siteConfig.calendlyUrl,
    // Replies only reach a person when the team inbox is the reply-to address.
    replyByEmail: Boolean(adminInbox),
    score,
    grade,
    auditId,
    appUrl: base,
  });

  await Promise.all([
    sendAdminEmail({ kind: "admin_new_lead", ...lead, replyTo: user.email, idempotencyKey: `lead-${userId}`, businessId: user.businessId }),
    sendEmail({ kind: "client_welcome", to: user.email, ...welcome, replyTo: adminInbox ?? undefined, idempotencyKey: `welcome-${userId}`, businessId: user.businessId }),
  ]);
}

/** A client wrote in: alert the team, and confirm receipt to the client when it starts a new conversation. */
export async function notifySupportMessageFromClient(messageId: string, isNewThread: boolean): Promise<void> {
  const message = await prisma.supportMessage.findUnique({
    where: { id: messageId },
    include: { thread: { include: { business: { include: { users: { select: { email: true }, orderBy: { createdAt: "asc" }, take: 1 } } } } } },
  });
  if (!message) return;
  const { thread } = message;
  const base = appUrl();
  const { adminInbox } = emailConfig();
  // The author's login email is stored on the message; the business's first user is only a fallback for older rows.
  const authorEmail = message.author === "client" ? message.authorName : null;
  const clientEmail = authorEmail || thread.business.users[0]?.email || "";

  const admin = await sendAdminEmail({
    kind: "admin_support_message",
    ...adminSupportMessageEmail({
      businessName: thread.business.name,
      threadId: thread.id,
      subject: thread.subject,
      body: message.body,
      fromEmail: clientEmail || "(no login email)",
      isNewThread,
      appUrl: base,
    }),
    replyTo: clientEmail || undefined,
    idempotencyKey: `support-${messageId}-admin`,
    businessId: thread.businessId,
  });

  if (isNewThread && clientEmail) {
    await sendEmail({
      kind: "client_support_receipt",
      to: clientEmail,
      ...clientSupportReceiptEmail({ businessName: thread.business.name, threadId: thread.id, subject: thread.subject, body: message.body, appUrl: base }),
      replyTo: adminInbox ?? undefined,
      idempotencyKey: `support-${messageId}-receipt`,
      businessId: thread.businessId,
    });
  }

  // For a client-authored message, emailStatus records whether the team copy went out.
  await prisma.supportMessage.update({ where: { id: messageId }, data: { emailStatus: admin.status } });
}

/** The team replied: email every login on the business and record the delivery status on the message. */
export async function notifySupportReplyFromAdmin(messageId: string): Promise<void> {
  const message = await prisma.supportMessage.findUnique({
    where: { id: messageId },
    include: { thread: { include: { business: { include: { users: { select: { id: true, email: true } } } } } } },
  });
  if (!message) return;
  const { thread } = message;
  const base = appUrl();
  const { adminInbox } = emailConfig();

  const results = await Promise.all(
    thread.business.users.map((u) =>
      sendEmail({
        kind: "client_support_reply",
        to: u.email,
        ...clientSupportReplyEmail({
          businessName: thread.business.name,
          threadId: thread.id,
          subject: thread.subject,
          body: message.body,
          replyByEmail: Boolean(adminInbox),
          appUrl: base,
        }),
        replyTo: adminInbox ?? undefined,
        idempotencyKey: `support-${messageId}-${u.id}`,
        businessId: thread.businessId,
      })
    )
  );
  const status: EmailStatus = results.length === 0 ? "skipped" : results.some((r) => r.status === "sent") ? "sent" : results[0].status;
  await prisma.supportMessage.update({ where: { id: messageId }, data: { emailStatus: status } });
}
