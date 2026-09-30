import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ createAdminSession: vi.fn(), destroyAdminSession: vi.fn() }));

import { adminLoginAction } from "./adminAuth";

const ORIGINAL_ENV = { ...process.env };

function form(next?: string): FormData {
  const fd = new FormData();
  fd.set("password", "test-admin-password");
  if (next !== undefined) fd.set("next", next);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_PASSWORD = "test-admin-password";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("adminLoginAction ?next= handling", () => {
  it("returns to an admin deep link after login", async () => {
    await adminLoginAction({}, form("/admin/support/t1"));
    expect(redirect).toHaveBeenCalledWith("/admin/support/t1");
  });

  it("falls back to the admin home without a next value", async () => {
    await adminLoginAction({}, form());
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it.each(["https://evil.example/admin", "//evil.example/admin", "/dashboard/support/t1", "/administrator", "/admin\\@evil.example", ""])(
    "ignores an off-site or unexpected next value %j",
    async (next) => {
      await adminLoginAction({}, form(next));
      expect(redirect).toHaveBeenCalledWith("/admin");
    }
  );

  it("does not redirect on a wrong password", async () => {
    const fd = form("/admin/support/t1");
    fd.set("password", "nope");
    await expect(adminLoginAction({}, fd)).resolves.toEqual({ error: "Incorrect password." });
    expect(redirect).not.toHaveBeenCalled();
  });
});
