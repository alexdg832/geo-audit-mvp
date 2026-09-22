"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/session";
import { ActionState } from "./types";

async function createAccountForAudit(auditId: string, email: string, password: string) {
  const audit = await prisma.audit.findUniqueOrThrow({ where: { id: auditId } });
  const passwordHash = hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, businessId: audit.businessId },
  });
  await createUserSession(user.id);
  return user;
}

function validateCredentials(email: string, password: string): string | null {
  if (!email || !password) return "Email and password are required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return null;
}

export async function bookCallAction(
  auditId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim();
  const goals = String(formData.get("goals") || "").trim() || null;

  const validationError = validateCredentials(email, password);
  if (validationError) return { error: validationError };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists. Try logging in instead." };
  }

  const user = await createAccountForAudit(auditId, email, password);
  await prisma.contactRequest.create({
    data: { userId: user.id, name: name || email, email, goals, wantsCall: true },
  });

  redirect("/dashboard?booked=1");
}

export async function skipContactAction(
  auditId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const validationError = validateCredentials(email, password);
  if (validationError) return { error: validationError };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists. Try logging in instead." };
  }

  await createAccountForAudit(auditId, email, password);
  redirect("/dashboard");
}
