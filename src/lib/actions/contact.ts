"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createUserSession } from "@/lib/auth/session";
import { verifySignedToken } from "@/lib/auth/signedToken";
import { notifyNewLead } from "@/lib/email/notify";
import { ActionState } from "./types";

const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/** Team alert + welcome email, sent after the redirect so delivery never delays or fails sign-up. */
function queueLeadEmails(userId: string, auditId: string, wantsCall: boolean): void {
  after(async () => {
    try {
      await notifyNewLead(userId, auditId, wantsCall);
    } catch (err) {
      console.error("Lead emails failed", { userId, message: err instanceof Error ? err.message : String(err) });
    }
  });
}

async function holdsClaimCookie(auditId: string): Promise<boolean> {
  const store = await cookies();
  const payload = verifySignedToken<{ auditId: string }>(store.get(`geo_claim_${auditId}`)?.value);
  return payload?.auditId === auditId;
}

/** Attaches a new account to the audited business; only the browser that ran the audit may claim it, and only once. */
async function createAccountForAudit(auditId: string, email: string, password: string): Promise<{ userId: string } | { error: string }> {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: { businessId: true, business: { select: { _count: { select: { users: true } } } } },
  });
  if (!audit) return { error: "Audit not found." };
  if (audit.business._count.users > 0) return { error: "This business already has an account. Try logging in instead." };
  if (!(await holdsClaimCookie(auditId))) {
    return { error: "This audit can only be claimed from the browser that ran it. Run a new audit to create an account." };
  }
  const passwordHash = hashPassword(password);
  try {
    const user = await prisma.user.create({ data: { email, passwordHash, businessId: audit.businessId } });
    await createUserSession(user.id);
    return { userId: user.id };
  } catch {
    return { error: "An account with that email already exists. Try logging in instead." };
  }
}

function validateCredentials(email: string, password: string): string | null {
  if (!email || !password) return "Email and password are required.";
  if (!EMAIL_REGEX.test(email) || email.length > 254) return "Please enter a valid email address.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be at most 128 characters.";
  return null;
}

export async function bookCallAction(auditId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim().slice(0, 200);
  const goals = String(formData.get("goals") || "").trim().slice(0, 2000) || null;

  const validationError = validateCredentials(email, password);
  if (validationError) return { error: validationError };

  const result = await createAccountForAudit(auditId, email, password);
  if ("error" in result) return { error: result.error };
  await prisma.contactRequest.create({
    data: { userId: result.userId, name: name || email, email, goals, wantsCall: true },
  });
  queueLeadEmails(result.userId, auditId, true);

  redirect("/dashboard?booked=1");
}

export async function skipContactAction(auditId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const validationError = validateCredentials(email, password);
  if (validationError) return { error: validationError };

  const result = await createAccountForAudit(auditId, email, password);
  if ("error" in result) return { error: result.error };
  queueLeadEmails(result.userId, auditId, false);
  redirect("/dashboard");
}
