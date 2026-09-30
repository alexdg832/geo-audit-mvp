import { describe, expect, it } from "vitest";
import {
  adminAuditStartedEmail,
  adminNewLeadEmail,
  adminSupportMessageEmail,
  clientSupportReceiptEmail,
  clientSupportReplyEmail,
  clientWelcomeEmail,
  escapeHtml,
  safeSubject,
  textToHtml,
} from "./templates";

const APP = "https://example.test";

describe("escapeHtml / textToHtml", () => {
  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
  });

  it("turns blank lines into paragraphs and single newlines into breaks", () => {
    expect(textToHtml("one\ntwo\n\nthree")).toBe('<p style="margin:0 0 12px">one<br>two</p><p style="margin:0 0 12px">three</p>');
  });
});

describe("safeSubject", () => {
  it("folds CR, LF, tabs and other control characters into single spaces", () => {
    expect(safeSubject("Acme\r\nBcc: victim@example.com")).toBe("Acme Bcc: victim@example.com");
    expect(safeSubject("  a\t\tb \u0000c  ")).toBe("a b c");
  });

  it("keeps a business name containing CRLF out of every subject header", () => {
    const businessName = "Acme\r\nBcc: victim@example.com";
    const subjects = [
      adminAuditStartedEmail({ businessName, website: null, location: null, auditId: "a1", rerun: false, appUrl: APP }).subject,
      adminNewLeadEmail({ businessName, businessId: "b1", email: "o@acme.test", name: null, goals: null, wantsCall: false, score: null, grade: null, auditId: "a1", appUrl: APP }).subject,
      clientWelcomeEmail({ businessName, wantsCall: false, calendlyUrl: null, replyByEmail: true, score: null, grade: null, auditId: "a1", appUrl: APP }).subject,
      adminSupportMessageEmail({ businessName, threadId: "t1", subject: "Hi\nthere", body: "x", fromEmail: "o@acme.test", isNewThread: true, appUrl: APP }).subject,
      clientSupportReceiptEmail({ businessName, threadId: "t1", subject: "Hi\rthere", body: "x", appUrl: APP }).subject,
      clientSupportReplyEmail({ businessName, threadId: "t1", subject: "Hi\r\nthere", body: "x", replyByEmail: true, appUrl: APP }).subject,
    ];
    for (const subject of subjects) {
      expect(subject).not.toMatch(/[\r\n\t]/);
      expect(subject.split("\n")).toHaveLength(1);
    }
    expect(subjects[0]).toBe("New audit started: Acme Bcc: victim@example.com");
  });
});

describe("email templates", () => {
  it("never renders user-supplied text as markup", () => {
    const email = adminNewLeadEmail({
      businessName: "Acme <script>alert(1)</script>",
      businessId: "b1",
      email: "owner@acme.test",
      name: "\"Owner\"",
      goals: "Fix <b>everything</b>\n\nASAP",
      wantsCall: true,
      score: 42,
      grade: "Poor",
      auditId: "a1",
      appUrl: APP,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>everything</b>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("42/100 (Poor)");
    expect(email.html).toContain(`${APP}/admin/clients/b1`);
    expect(email.text).toContain("Fix <b>everything</b>");
    expect(email.subject).toBe("New lead wants a call: Acme <script>alert(1)</script>");
  });

  it("includes the booking link only when the client asked for a call", () => {
    const base = { businessName: "Acme", calendlyUrl: "https://calendly.test/acme", replyByEmail: true, score: null, grade: null, auditId: "a1", appUrl: APP };
    expect(clientWelcomeEmail({ ...base, wantsCall: true }).html).toContain("https://calendly.test/acme");
    expect(clientWelcomeEmail({ ...base, wantsCall: false }).html).not.toContain("calendly.test");
    expect(clientWelcomeEmail({ ...base, wantsCall: false }).text).toContain(`${APP}/dashboard/support`);
  });

  it("promises a follow-up email instead of a booking link when Calendly is not configured", () => {
    const email = clientWelcomeEmail({ businessName: "Acme", wantsCall: true, calendlyUrl: null, replyByEmail: true, score: null, grade: null, auditId: "a1", appUrl: APP });
    expect(email.html).not.toContain("calendly");
    expect(email.html).not.toContain("Book a call");
    expect(email.html).toContain("We will email you to pick a time");
    expect(email.text).toContain("We will email you to pick a time");
    expect(email.text).not.toContain("Book a call");
  });

  it("only tells the client to reply by email when a reply-to inbox exists", () => {
    const base = { businessName: "Acme", wantsCall: false, calendlyUrl: null, score: null, grade: null, auditId: "a1", appUrl: APP };
    expect(clientWelcomeEmail({ ...base, replyByEmail: true }).html).toContain("Reply to this email");
    expect(clientWelcomeEmail({ ...base, replyByEmail: false }).html).not.toContain("Reply to this email");
    expect(clientWelcomeEmail({ ...base, replyByEmail: false }).html).toContain(`${APP}/dashboard/support`);

    const reply = { businessName: "Acme", threadId: "t1", subject: "Hours", body: "Fixed.", appUrl: APP };
    expect(clientSupportReplyEmail({ ...reply, replyByEmail: true }).html).toContain("replying to this email");
    expect(clientSupportReplyEmail({ ...reply, replyByEmail: false }).html).not.toContain("replying to this email");
    expect(clientSupportReplyEmail({ ...reply, replyByEmail: false }).html).toContain("You can answer from your dashboard.");
  });

  it("links the team to the admin thread and quotes the client's message", () => {
    const email = adminSupportMessageEmail({
      businessName: "Acme",
      threadId: "t1",
      subject: "Wrong phone number",
      body: "ChatGPT says 555-0100 but it's 555-0199.",
      fromEmail: "owner@acme.test",
      isNewThread: true,
      appUrl: APP,
    });
    expect(email.subject).toBe("New support message from Acme: Wrong phone number");
    expect(email.html).toContain(`${APP}/admin/support/t1`);
    expect(email.html).toContain("it&#39;s 555-0199");
  });
});
