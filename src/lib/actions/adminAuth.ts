"use server";

import { redirect } from "next/navigation";
import { createAdminSession, destroyAdminSession } from "@/lib/auth/session";
import { ActionState } from "./types";

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
  redirect("/admin");
}

export async function adminLogoutAction() {
  await destroyAdminSession();
  redirect("/admin/login");
}
