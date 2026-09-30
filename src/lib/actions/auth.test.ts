import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db", () => ({ prisma }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: () => true }));
vi.mock("@/lib/auth/session", () => ({ createUserSession: vi.fn(), destroyUserSession: vi.fn() }));

import { loginAction } from "./auth";

function form(next?: string): FormData {
  const fd = new FormData();
  fd.set("email", "owner@acme.test");
  fd.set("password", "correct-horse");
  if (next !== undefined) fd.set("next", next);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "hash" });
});

describe("loginAction ?next= handling", () => {
  it("returns to a dashboard deep link after login", async () => {
    await loginAction({}, form("/dashboard/support/t1"));
    expect(redirect).toHaveBeenCalledWith("/dashboard/support/t1");
  });

  it("falls back to the dashboard without a next value", async () => {
    await loginAction({}, form());
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it.each([
    "https://evil.example/dashboard",
    "//evil.example/dashboard",
    "/admin/support/t1",
    "/dashboardx",
    "/dashboard\\@evil.example",
    "/dashboard/\r\nSet-Cookie: x",
    "javascript:alert(1)",
    "",
  ])("ignores an off-site or unexpected next value %j", async (next) => {
    await loginAction({}, form(next));
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
