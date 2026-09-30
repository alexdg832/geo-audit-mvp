// Server-side only by construction: client components import view-model types from
// src/lib/report/format.ts, never from modules that reach this file. (A "server-only" import
// would also break the seed and maintenance scripts, which run under plain Node.)
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
