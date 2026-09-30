#!/usr/bin/env node
// Starts an embedded PostgreSQL for local development. Data persists in .local/pg (gitignored).
import { existsSync, mkdirSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const DATABASE_DIR = ".local/pg";
const PORT = 54329;
const USER = "geo";
const PASSWORD = "geo";
const DB = "geo";

const pg = new EmbeddedPostgres({
  databaseDir: DATABASE_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  onLog: () => {},
  onError: (e) => process.stderr.write(`${String(e)}\n`),
});

const fresh = !existsSync(`${DATABASE_DIR}/PG_VERSION`);
if (fresh) {
  mkdirSync(DATABASE_DIR, { recursive: true });
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB]);
await client.end();
if (rowCount === 0) await pg.createDatabase(DB);

process.stdout.write(
  `embedded postgres ready (${fresh ? "new cluster" : "existing cluster"})\n` +
    `DATABASE_URL=postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB}\n` +
    `Press Ctrl+C to stop.\n`
);

async function shutdown() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
