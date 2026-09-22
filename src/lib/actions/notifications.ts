"use server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function getNotificationsSummary() {
  const user = await getCurrentUser();
  if (!user) return { count: 0, notifications: [] };

  const [count, notifications] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return { count, notifications };
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
}
