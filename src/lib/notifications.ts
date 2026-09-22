import { prisma } from "@/lib/db";

/** Notifies every client user linked to a business (in practice, exactly one). */
export async function notifyBusinessUsers(businessId: string, message: string): Promise<void> {
  const users = await prisma.user.findMany({ where: { businessId }, select: { id: true } });
  if (users.length === 0) return;
  await prisma.notification.createMany({
    data: users.map((u) => ({ userId: u.id, message })),
  });
}
