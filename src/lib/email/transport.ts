/**
 * Resend transport: plain fetch against the REST API, no SDK.
 * Never throws, and never logs the key or any request header.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

export type EmailKind =
  | "admin_audit_started"
  | "admin_new_lead"
  | "client_welcome"
  | "admin_support_message"
  | "client_support_receipt"
  | "client_support_reply";

export type EmailStatus = "sent" | "failed" | "skipped";

export type EmailRequest = {
  kind: EmailKind;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Resend de-duplicates requests that reuse a key within 24 hours. */
  idempotencyKey?: string;
  businessId?: string | null;
};

export type EmailResult = { status: EmailStatus; id?: string; error?: string };

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SANDBOX_FROM = "TrueSource <onboarding@resend.dev>";
const TIMEOUT_MS = 10_000;

export function emailConfig() {
  const from = process.env.RESEND_FROM_EMAIL?.trim() || SANDBOX_FROM;
  return {
    configured: Boolean(process.env.RESEND_API_KEY),
    from,
    /**
     * Resend's sandbox sender (any @resend.dev address, including the quickstart's onboarding@resend.dev when it is set
     * explicitly) only delivers to the address that owns the Resend account: client emails fail, and team alerts only
     * arrive when ADMIN_NOTIFY_EMAIL is that same address.
     */
    sandboxSender: /@resend\.dev>?$/i.test(from),
    adminInbox: process.env.ADMIN_NOTIFY_EMAIL?.trim() || null,
  };
}

/** Public base URL used for links inside emails. */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  // Vercel sets VERCEL_PROJECT_PRODUCTION_URL on Preview deployments too; only Production may link there, otherwise a
  // Preview would email links to threads that do not exist on the production host. Preview links stay behind Vercel's
  // deployment protection, which is expected while testing.
  const env = process.env.VERCEL_ENV;
  const host =
    env === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
      : env === "preview"
        ? process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
        : undefined;
  const trimmed = host?.trim();
  if (trimmed) return `https://${trimmed}`;
  return "http://localhost:3000";
}

type ResendBody = { id?: string; name?: string; message?: string };

export async function deliverViaResend(req: EmailRequest, fetchImpl: typeof fetch = fetch): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "skipped", error: "RESEND_API_KEY is not set" };
  if (!req.to) return { status: "skipped", error: "No recipient address" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey.slice(0, 256);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: emailConfig().from,
        to: [req.to],
        subject: req.subject,
        html: req.html,
        text: req.text,
        ...(req.replyTo ? { reply_to: req.replyTo } : {}),
      }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as ResendBody | null;
    if (!res.ok) {
      const detail = [body?.name, body?.message].filter(Boolean).join(": ");
      return { status: "failed", error: `HTTP ${res.status}${detail ? ` ${detail}` : ""}`.slice(0, 500) };
    }
    return { status: "sent", id: body?.id };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      status: "failed",
      error: aborted ? `Timed out after ${TIMEOUT_MS} ms` : err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
