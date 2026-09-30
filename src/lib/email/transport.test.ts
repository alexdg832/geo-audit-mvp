import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverViaResend, emailConfig, appUrl, RESEND_ENDPOINT, type EmailRequest } from "./transport";

const REQUEST: EmailRequest = {
  kind: "client_welcome",
  to: "owner@acme.test",
  subject: "Welcome",
  html: "<p>Hi</p>",
  text: "Hi",
  replyTo: "team@example.test",
  idempotencyKey: "welcome-u1",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.ADMIN_NOTIFY_EMAIL;
  delete process.env.APP_URL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_BRANCH_URL;
  delete process.env.VERCEL_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("deliverViaResend", () => {
  it("skips without calling the network when no key is configured", async () => {
    const fetchImpl = vi.fn();
    const result = await deliverViaResend(REQUEST, fetchImpl as unknown as typeof fetch);
    expect(result.status).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the documented body shape and returns the provider id", async () => {
    process.env.RESEND_API_KEY = "test-not-a-real-key";
    process.env.RESEND_FROM_EMAIL = "TrueSource <hello@example.test>";
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: "email_123" }));
    const result = await deliverViaResend(REQUEST, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ status: "sent", id: "email_123" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-not-a-real-key");
    expect(headers["Idempotency-Key"]).toBe("welcome-u1");
    expect(JSON.parse(String(init.body))).toEqual({
      from: "TrueSource <hello@example.test>",
      to: ["owner@acme.test"],
      subject: "Welcome",
      html: "<p>Hi</p>",
      text: "Hi",
      reply_to: "team@example.test",
    });
  });

  it("reports the provider's error name and message on a rejected send", async () => {
    process.env.RESEND_API_KEY = "test-not-a-real-key";
    const fetchImpl = vi.fn(async () => jsonResponse(403, { statusCode: 403, name: "validation_error", message: "You can only send testing emails to your own email address" }));
    const result = await deliverViaResend(REQUEST, fetchImpl as unknown as typeof fetch);
    expect(result.status).toBe("failed");
    expect(result.error).toBe("HTTP 403 validation_error: You can only send testing emails to your own email address");
  });

  it("turns a network failure into a failed result instead of throwing", async () => {
    process.env.RESEND_API_KEY = "test-not-a-real-key";
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(deliverViaResend(REQUEST, fetchImpl as unknown as typeof fetch)).resolves.toEqual({ status: "failed", error: "ECONNRESET" });
  });
});

describe("emailConfig / appUrl", () => {
  it("falls back to the sandbox sender and flags it", () => {
    expect(emailConfig()).toMatchObject({ configured: false, sandboxSender: true, adminInbox: null });
    process.env.RESEND_FROM_EMAIL = "Acme <hi@acme.test>";
    process.env.ADMIN_NOTIFY_EMAIL = " team@acme.test ";
    expect(emailConfig()).toMatchObject({ from: "Acme <hi@acme.test>", sandboxSender: false, adminInbox: "team@acme.test" });
  });

  it("flags an explicitly configured @resend.dev sender as sandbox too", () => {
    process.env.RESEND_FROM_EMAIL = "onboarding@resend.dev";
    expect(emailConfig().sandboxSender).toBe(true);
    process.env.RESEND_FROM_EMAIL = "TrueSource <Onboarding@Resend.dev>";
    expect(emailConfig().sandboxSender).toBe(true);
    process.env.RESEND_FROM_EMAIL = "TrueSource <hello@resend.dev.example>";
    expect(emailConfig().sandboxSender).toBe(false);
  });

  it("prefers APP_URL, then the Vercel production host on Production, then localhost", () => {
    expect(appUrl()).toBe("http://localhost:3000");
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "geo.example.test";
    process.env.VERCEL_URL = "geo-abc123.vercel.test";
    expect(appUrl()).toBe("https://geo.example.test");
    process.env.APP_URL = "https://truesource.example/";
    expect(appUrl()).toBe("https://truesource.example");
  });

  it("never links a Preview deployment to the production host", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "geo.example.test";
    process.env.VERCEL_URL = "geo-abc123.vercel.test";
    expect(appUrl()).toBe("https://geo-abc123.vercel.test");
    process.env.VERCEL_BRANCH_URL = "geo-git-feature.vercel.test";
    expect(appUrl()).toBe("https://geo-git-feature.vercel.test");
  });

  it("ignores Vercel hosts outside a Vercel production or preview build", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "geo.example.test";
    process.env.VERCEL_URL = "localhost:3000";
    expect(appUrl()).toBe("http://localhost:3000");
    process.env.VERCEL_ENV = "development";
    expect(appUrl()).toBe("http://localhost:3000");
  });
});
