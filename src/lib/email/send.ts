import { prisma } from "@/lib/db";
import { deliverViaResend, emailConfig, type EmailKind, type EmailRequest, type EmailResult, type EmailStatus } from "./transport";

type EmailEventInput = {
  kind: EmailKind;
  to: string;
  subject: string;
  status: EmailStatus;
  providerId?: string | null;
  error?: string | null;
  businessId?: string | null;
};

/** Every attempt is logged so the admin can see what was (not) delivered and why. */
export async function recordEmailEvent(event: EmailEventInput): Promise<void> {
  try {
    await prisma.emailEvent.create({
      data: {
        kind: event.kind,
        to: event.to,
        subject: event.subject.slice(0, 500),
        status: event.status,
        providerId: event.providerId ?? null,
        error: event.error ?? null,
        businessId: event.businessId ?? null,
      },
    });
  } catch (err) {
    console.error("Email event not recorded", { kind: event.kind, message: err instanceof Error ? err.message : String(err) });
  }
}

/** Sends one email through Resend and records the outcome. Never throws. */
export async function sendEmail(req: EmailRequest): Promise<EmailResult> {
  const result = await deliverViaResend(req);
  await recordEmailEvent({
    kind: req.kind,
    to: req.to,
    subject: req.subject,
    status: result.status,
    providerId: result.id,
    error: result.error,
    businessId: req.businessId,
  });
  if (result.status !== "sent") console.warn("Email not sent", { kind: req.kind, status: result.status, error: result.error });
  return result;
}

/** Sends to the team inbox (ADMIN_NOTIFY_EMAIL); records a skipped event when it is not set. */
export async function sendAdminEmail(req: Omit<EmailRequest, "to">): Promise<EmailResult> {
  const { adminInbox } = emailConfig();
  if (!adminInbox) {
    const result: EmailResult = { status: "skipped", error: "ADMIN_NOTIFY_EMAIL is not set" };
    await recordEmailEvent({ kind: req.kind, to: "(team inbox not configured)", subject: req.subject, status: result.status, error: result.error, businessId: req.businessId });
    return result;
  }
  return sendEmail({ ...req, to: adminInbox });
}
