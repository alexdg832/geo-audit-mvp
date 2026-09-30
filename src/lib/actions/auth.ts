"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSession, destroyUserSession } from "@/lib/auth/session";
import { ActionState } from "./types";

// Only a same-origin path under /dashboard may follow a login: no scheme, no "//" host, no backslash or control characters.
// (Kept local because a "use server" file may only export async functions.)
const NEXT_PATH = /^\/dashboard(?:[/?#][^\s\\]*)?$/;

function nextPath(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  return NEXT_PATH.test(value) ? value : "/dashboard";
}

export async function loginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) return { error: "Email and password are required." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password." };
  }

  await createUserSession(user.id);
  redirect(nextPath(formData.get("next")));
}

export async function logoutAction() {
  await destroyUserSession();
  redirect("/login");
}
