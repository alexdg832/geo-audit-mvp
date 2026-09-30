import { describe, expect, it } from "vitest";
import { adminNewLeadEmail, adminSupportMessageEmail, clientWelcomeEmail, escapeHtml, textToHtml } from "./templates";

const APP = "https://example.test";

describe("escapeHtml / textToHtml", () => {
  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
  });

  it("turns blank lines into paragraphs and single newlines into breaks", () => {
    expect(textToHtml("one\ntwo\n\nthree")).toBe('<p style="margin:0 0 12px">one<br>two</p><p style="margin:0 0 12px">three</p>');
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
    const base = { businessName: "Acme", calendlyUrl: "https://calendly.test/acme", score: null, grade: null, auditId: "a1", appUrl: APP };
    expect(clientWelcomeEmail({ ...base, wantsCall: true }).html).toContain("https://calendly.test/acme");
    expect(clientWelcomeEmail({ ...base, wantsCall: false }).html).not.toContain("calendly.test");
    expect(clientWelcomeEmail({ ...base, wantsCall: false }).text).toContain(`${APP}/dashboard/support`);
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
