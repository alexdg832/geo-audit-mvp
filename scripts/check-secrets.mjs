#!/usr/bin/env node
// Scans staged files (or the whole tree with --all) for strings that look like live credentials.
// Usage: node scripts/check-secrets.mjs [--all]
// A line containing "check-secrets:allow" is skipped.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  ["OpenAI key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["Perplexity key", /\bpplx-[A-Za-z0-9]{20,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/],
  ["Google token", /\bAQ\.[A-Za-z0-9_-]{30,}/],
  ["Resend key", /\bre_[A-Za-z0-9]{20,}/],
  ["Database URL with password", /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/]+:[^\s@/]+@/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["Slack token", /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
  ["Stripe key", /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/],
  ["Vercel token", /\bvcp_[A-Za-z0-9]{20,}/],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["Generic assignment", /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{32,}["']?/i],
];

const SKIP_PATH = /(^|\/)(node_modules|\.git|\.next|\.vercel)\/|(^|\/)package-lock\.json$|\.lock$|\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|pdf|zip|gz|tsbuildinfo)$/;
const PLACEHOLDER = /password@|<[^>]+>|xxx|example|changeme|change-me|your[-_]|\$\{/i;

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || `git ${args.join(" ")} failed\n`);
    process.exit(2);
  }
  return r.stdout;
}

const scanAll = process.argv.includes("--all");
const files = scanAll
  ? git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
  : git(["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"]);
const paths = files.split("\0").filter((p) => p && !SKIP_PATH.test(p));

function contentOf(path) {
  if (scanAll) {
    try { return readFileSync(path, "utf8"); } catch { return null; }
  }
  const r = spawnSync("git", ["show", `:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

const hits = [];
for (const path of paths) {
  const text = contentOf(path);
  if (text == null || text.includes("\0")) continue;
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line.includes("check-secrets:allow")) return;
    for (const [label, re] of PATTERNS) {
      const m = re.exec(line);
      if (m && !PLACEHOLDER.test(m[0])) {
        const masked = `${m[0].slice(0, 4)}…(${m[0].length} chars)`;
        hits.push(`${path}:${i + 1}  ${label}  ${masked}`);
        break;
      }
    }
  });
}

if (hits.length) {
  process.stderr.write(`\ncheck-secrets: ${hits.length} possible secret(s) in ${scanAll ? "the tree" : "staged files"}:\n`);
  for (const h of hits) process.stderr.write(`  ${h}\n`);
  process.stderr.write(`\nMove secrets to .env.local (gitignored). If a match is a false positive, add "check-secrets:allow" to that line.\n`);
  process.exit(1);
}
process.stdout.write(`check-secrets: clean (${paths.length} file(s) scanned)\n`);
