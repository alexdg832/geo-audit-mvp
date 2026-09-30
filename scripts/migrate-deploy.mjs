/**
 * Runs `prisma migrate deploy`, first baselining a database that was created with
 * `prisma db push` before this project adopted migrations.
 *
 * Baseline rule (one time, automatic): if the database has no `_prisma_migrations`
 * table but already has the `Business` table, the initial migration describes the
 * schema that is already there, so it is marked as applied without running it.
 * An empty database and a database with migration history are left to
 * `migrate deploy` untouched.
 *
 * Reads the connection string from the environment (Vercel sets it at build time);
 * never prints it.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { PrismaClient } from "@prisma/client";

const BASELINE_MIGRATION = "20260929000000_init";

// Local runs keep secrets in .env.local (same rule as prisma.config.ts); values already in
// the environment win, and an empty string counts as unset.
const envLocal = path.join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envLocal, "utf8")))) {
    if (value !== undefined && !process.env[key]) process.env[key] = value;
  }
}

function run(command) {
  execSync(command, { stdio: "inherit", env: process.env });
}

async function needsBaseline() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw`SELECT to_regclass('public._prisma_migrations')::text AS migrations, to_regclass('public."Business"')::text AS business`;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return Boolean(row && !row.migrations && row.business);
  } finally {
    await prisma.$disconnect();
  }
}

if (await needsBaseline()) {
  console.log(`migrate-deploy: existing schema without migration history; marking ${BASELINE_MIGRATION} as applied (one-time baseline).`);
  run(`npx prisma migrate resolve --applied ${BASELINE_MIGRATION}`);
}
run("npx prisma migrate deploy");
