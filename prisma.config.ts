import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { defineConfig } from "prisma/config";

// Prisma CLI only auto-loads .env; this project keeps secrets in .env.local.
// Values already present in the environment win, but an empty string counts as unset.
const envLocal = path.join(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envLocal, "utf8")))) {
    if (value !== undefined && !process.env[key]) process.env[key] = value;
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
