"use server";

import { redirect } from "next/navigation";
import { createAdminSession, destroyAdminSession } from "@/lib/auth/session";
import { ActionState } from "./types";

// Only a same-origin path under /admin may follow a login: no scheme, no "//" host, no backslash or control characters.
// (Kept local because a "use server" file may only export async functions.)
const NEXT_PATH = /^\/admin(?:[/?#][^\s\\]*)?$/;

function nextPath(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  return NEXT_PATH.test(value) ? value : "/admin";
}

export async function adminLoginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = String(formData.get("password") || "");

  if (!process.env.ADMIN_PASSWORD) {
    return { error: "ADMIN_PASSWORD is not configured on the server." };
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return { error: "Incorrect password." };
  }

  await createAdminSession();
  redirect(nextPath(formData.get("next")));
}

export async function adminLogoutAction() {
  await destroyAdminSession();
  redirect("/admin/login");
}
