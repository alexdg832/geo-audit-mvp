import { siteConfig } from "@config/site";

export type EmailContent = { subject: string; html: string; text: string };

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * A subject is a single-line mail header. Business names and other free text reach it, so CR/LF and every other control
 * character are folded to a space here, at the one place all subjects are built, instead of at each caller.
 */
export function safeSubject(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** User-written text to escaped HTML: blank lines separate paragraphs, single newlines become line breaks. */
export function textToHtml(value: string): string {
  return value
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type Row = [string, string | null | undefined];

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#57534e;margin:0 0 16px">${escapeHtml(siteConfig.name)}</p>
<div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;padding:24px">
<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
</div>
<p style="font-size:12px;color:#78716c;margin:16px 0 0">${escapeHtml(siteConfig.slogan)}</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0 8px"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function link(href: string): string {
  return `<a href="${escapeHtml(href)}" style="color:#1c1917">${escapeHtml(href)}</a>`;
}

function rows(items: Row[]): string {
  return `<table style="border-collapse:collapse;width:100%;font-size:14px">${items
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#57534e;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0">${v ? escapeHtml(v) : "—"}</td></tr>`
    )
    .join("")}</table>`;
}

function rowsText(items: Row[]): string {
  return items.map(([k, v]) => `${k}: ${v || "—"}`).join("\n");
}

function quote(body: string): string {
  return `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #d6d3d1;background:#fafaf9;font-size:14px">${textToHtml(body)}</blockquote>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.5">${escapeHtml(text)}</p>`;
}

function scoreLine(score: number | null, grade: string | null): string | null {
  if (score === null) return null;
  return grade ? `${score}/100 (${grade})` : `${score}/100`;
}

export function adminAuditStartedEmail(p: {
  businessName: string;
  website: string | null;
  location: string | null;
  auditId: string;
  rerun: boolean;
  appUrl: string;
}): EmailContent {
  const subject = safeSubject(`${p.rerun ? "Audit re-run" : "New audit started"}: ${p.businessName}`);
  const adminLink = `${p.appUrl}/admin/scans`;
  const reportLink = `${p.appUrl}/audit/${p.auditId}/results`;
  const items: Row[] = [
    ["Business", p.businessName],
    ["Website", p.website],
    ["Location", p.location],
  ];
  const html = layout(
    subject,
    rows(items) +
      button(adminLink, "Open scans in admin") +
      `<p style="font-size:13px;color:#57534e;margin:0">Report once the scan completes: ${link(reportLink)}</p>`
  );
  const text = `${subject}\n\n${rowsText(items)}\n\nScans: ${adminLink}\nReport: ${reportLink}`;
  return { subject, html, text };
}

export function adminNewLeadEmail(p: {
  businessName: string;
  businessId: string;
  email: string;
  name: string | null;
  goals: string | null;
  wantsCall: boolean;
  score: number | null;
  grade: string | null;
  auditId: string;
  appUrl: string;
}): EmailContent {
  const subject = safeSubject(`${p.wantsCall ? "New lead wants a call" : "New client account"}: ${p.businessName}`);
  const clientLink = `${p.appUrl}/admin/clients/${p.businessId}`;
  const reportLink = `${p.appUrl}/audit/${p.auditId}/results`;
  const items: Row[] = [
    ["Business", p.businessName],
    ["Contact", p.name],
    ["Email", p.email],
    ["Wants a call", p.wantsCall ? "Yes" : "No"],
    ["Latest score", scoreLine(p.score, p.grade)],
  ];
  const goalsHtml = p.goals ? para("What they want:") + quote(p.goals) : para("They did not leave any goals.");
  const html = layout(
    subject,
    rows(items) + goalsHtml + button(clientLink, "Open client in admin") + `<p style="font-size:13px;color:#57534e;margin:0">Report: ${link(reportLink)}</p>`
  );
  const text = `${subject}\n\n${rowsText(items)}\n\nGoals:\n${p.goals || "—"}\n\nClient: ${clientLink}\nReport: ${reportLink}`;
  return { subject, html, text };
}

const WILL_EMAIL_FOR_CALL = "You asked for a call. We will email you to pick a time.";

export function clientWelcomeEmail(p: {
  businessName: string;
  wantsCall: boolean;
  /** null until NEXT_PUBLIC_CALENDLY_URL is configured: the email then promises a follow-up instead of a dead link. */
  calendlyUrl: string | null;
  /** false when no reply-to inbox is configured, so the client is not told to answer by email. */
  replyByEmail: boolean;
  score: number | null;
  grade: string | null;
  auditId: string;
  appUrl: string;
}): EmailContent {
  const subject = safeSubject(`Welcome to ${siteConfig.name} — your GEO audit for ${p.businessName}`);
  const dashboardLink = `${p.appUrl}/dashboard`;
  const reportLink = `${p.appUrl}/audit/${p.auditId}/results`;
  const supportLink = `${p.appUrl}/dashboard/support`;
  const score = scoreLine(p.score, p.grade);
  const callHtml = !p.wantsCall ? "" : p.calendlyUrl ? para("You asked for a call. Pick a time that suits you:") + button(p.calendlyUrl, "Book a call") : para(WILL_EMAIL_FOR_CALL);
  const questions = p.replyByEmail ? "Questions? Reply to this email or use Support in your dashboard" : "Questions? Use Support in your dashboard";
  const parts = [
    para(`Your account for ${p.businessName} is ready. Your full report, roadmap and every fix we make for you live in your dashboard.`),
    score ? para(`Current score: ${score}.`) : "",
    callHtml,
    button(dashboardLink, "Open your dashboard"),
    `<p style="font-size:13px;color:#57534e;margin:0">Report: ${link(reportLink)}<br>${questions}: ${link(supportLink)}</p>`,
  ];
  const html = layout(`Welcome, ${p.businessName}`, parts.join(""));
  const text = [
    subject,
    "",
    `Your account for ${p.businessName} is ready.`,
    score ? `Current score: ${score}.` : "",
    !p.wantsCall ? "" : p.calendlyUrl ? `Book a call: ${p.calendlyUrl}` : WILL_EMAIL_FOR_CALL,
    `Dashboard: ${dashboardLink}`,
    `Report: ${reportLink}`,
    `Support: ${supportLink}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
  return { subject, html, text };
}

export function adminSupportMessageEmail(p: {
  businessName: string;
  threadId: string;
  subject: string;
  body: string;
  fromEmail: string;
  isNewThread: boolean;
  appUrl: string;
}): EmailContent {
  const subject = safeSubject(`${p.isNewThread ? "New support message" : "Support reply"} from ${p.businessName}: ${p.subject}`);
  const threadLink = `${p.appUrl}/admin/support/${p.threadId}`;
  const items: Row[] = [
    ["Client", p.businessName],
    ["From", p.fromEmail],
  ];
  const html = layout(subject, rows(items) + quote(p.body) + button(threadLink, "Reply in admin") + para("Replying to this email goes straight to the client; replying in admin also records it in their dashboard."));
  const text = `${subject}\n\n${rowsText(items)}\n\n${p.body}\n\nReply in admin: ${threadLink}`;
  return { subject, html, text };
}

export function clientSupportReceiptEmail(p: { businessName: string; threadId: string; subject: string; body: string; appUrl: string }): EmailContent {
  const subject = safeSubject(`We received your message: ${p.subject}`);
  const threadLink = `${p.appUrl}/dashboard/support/${p.threadId}`;
  const html = layout(
    "Thanks, we got your message",
    para("We'll reply here and in your dashboard, usually within one business day.") + quote(p.body) + button(threadLink, "View conversation")
  );
  const text = `${subject}\n\nWe'll reply by email and in your dashboard, usually within one business day.\n\nYour message:\n${p.body}\n\nConversation: ${threadLink}`;
  return { subject, html, text };
}

export function clientSupportReplyEmail(p: {
  businessName: string;
  threadId: string;
  subject: string;
  body: string;
  /** false when no reply-to inbox is configured, so the client is not told to answer by email. */
  replyByEmail: boolean;
  appUrl: string;
}): EmailContent {
  const subject = safeSubject(`Re: ${p.subject}`);
  const threadLink = `${p.appUrl}/dashboard/support/${p.threadId}`;
  const answerHint = p.replyByEmail ? "You can answer by replying to this email or from your dashboard." : "You can answer from your dashboard.";
  const html = layout(`Reply from ${siteConfig.name}`, quote(p.body) + button(threadLink, "View conversation") + para(answerHint));
  const text = `${subject}\n\n${p.body}\n\nConversation: ${threadLink}`;
  return { subject, html, text };
}
