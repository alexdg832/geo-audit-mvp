import { cookies } from "next/headers";
import { createSignedToken, verifySignedToken } from "./signedToken";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "geo_session";
const ADMIN_COOKIE = "geo_admin_session";

type SessionPayload = { userId: string };

export async function createUserSession(userId: string) {
  const token = createSignedToken<SessionPayload>({ userId });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroyUserSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const store = await cookies();
  const payload = verifySignedToken<SessionPayload>(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  return prisma.user.findUnique({
    where: { id: payload.userId },
    include: { business: true },
  });
}

export async function createAdminSession() {
  const token = createSignedToken<{ admin: true }>({ admin: true }, 60 * 60 * 1000 * 8);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function isAdmin() {
  const store = await cookies();
  const payload = verifySignedToken<{ admin: true }>(store.get(ADMIN_COOKIE)?.value);
  return Boolean(payload?.admin);
}
