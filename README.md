# TrueSource

TrueSource is a GEO (Generative Engine Optimization) audit MVP. It audits how AI
assistants like ChatGPT and Claude describe a business, grades the trustworthiness
of the sources they're pulling from, and helps the business fix what's wrong. No
paid API keys are required.

Live demo: **https://geo-audit-mvp.vercel.app**

## Quickstart

Data is stored in Postgres (via [Neon](https://neon.tech), provisioned through the
Vercel Marketplace in production). For local dev you can either point
`DATABASE_URL` / `DATABASE_URL_UNPOOLED` at any Postgres database, or use the
embedded Postgres that ships as a dev dependency (no Docker or system install):

```bash
cp .env.example .env.local   # all secrets live in .env.local (gitignored); never in .env
npm install
npm run db:dev               # starts embedded Postgres on 127.0.0.1:54329, keep it running
                             # then set DATABASE_URL and DATABASE_URL_UNPOOLED to
                             # postgresql://geo:geo@127.0.0.1:54329/geo in .env.local
npx prisma db push           # syncs the schema — run again after schema changes
npx prisma db seed           # loads demo client + demo admin data — optional but recommended
npm run dev
```

Other useful scripts: `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run check-secrets` (scans staged files for key-like strings; enable it as a
pre-commit hook with `git config core.hooksPath scripts/git-hooks`).

Then open [http://localhost:3000](http://localhost:3000).

If this repo is linked to the Vercel project (`vercel link`), you can instead run
`vercel env pull .env --environment=preview` — note that the database URLs are
marked "Sensitive" in Vercel and won't come through via CLI pull; toggle that off
in the dashboard (Settings → Environment Variables) if you want local dev wired
to the same database.

## Environment variables

Set in `.env.local` (see `.env.example`). Every secret is read server-side only;
nothing is ever exposed with a `NEXT_PUBLIC_` prefix.

- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Postgres connection strings (pooled and direct). Neon provides both automatically on Vercel.
- `SESSION_SECRET` — secret used to sign client session cookies.
- `ADMIN_PASSWORD` — the password that gates `/admin`.
- `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY` — AI engine keys. Each engine is enabled only when its key is present; missing engines are reported as "not configured" and the scan proceeds with the rest.
- `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `GEMINI_MODEL`, `PERPLEXITY_MODEL` (and `*_FAST_MODEL`) — optional model overrides.
- `SCAN_PER_IP_HOURLY_LIMIT`, `SCAN_GLOBAL_HOURLY_LIMIT` — optional rate limits for anonymous scan starts (defaults 3 and 30).
- `RESEND_API_KEY` — transactional email (team alerts, welcome email, support thread copies). Without it every email is logged as "skipped".
- `ADMIN_NOTIFY_EMAIL` — where team alerts go (new audit started, new lead, new support message).
- `RESEND_FROM_EMAIL` — sender on outgoing email; set it only after verifying a domain in Resend. Unset uses Resend's sandbox sender, which only delivers to the Resend account owner.
- `APP_URL` — public base URL for links inside emails (defaults to the Vercel production URL, then localhost).
- `NEXT_PUBLIC_CALENDLY_URL` — the booking link shown to clients (public, so the prefix is fine). Unset shows a placeholder link and no inline embed.
- `MOCK_MODE` — `"true"` runs the whole audit on labelled fixture data with no provider keys. Local development only.

## Walking through the app

**As a business owner:**

1. Land on the homepage and start an audit for your business.
2. Watch the scan ask four AI engines the questions your customers ask, then read the report: score and grade, critical failures, six-pillar breakdown, every engine answer with its cited sources, competitors, source map, cost of inaction and a prioritised roadmap.
3. Click "Fix this with us" to either book a call or skip straight to a client account. Either way you get a welcome email and the team gets a "new lead" alert.
4. Land on your client dashboard, where you can track your Truth Brief and content pushes over time.
5. Open **Support** from the dashboard to message the team, book a call (Calendly), and see every conversation and reply in one place. Replies also arrive by email.

**As an admin:**

1. Go to `/admin/login` and enter `ADMIN_PASSWORD`.
2. Open the seeded demo client (or any real client that signed up).
3. Write a Truth Brief, create or update content pushes, and send a notification.
4. Check the client dashboard — the notification shows up there as unread.
5. Open **Support** in the admin nav: every client conversation, filterable by status. A reply from there lands in the client's dashboard, their notification bell and their inbox.
6. **Provider status** shows engine health and, at the bottom, the email delivery log (every email attempted, with the reason when one was skipped or failed).

## Demo accounts

Running `npx prisma db seed` prints a demo client email and password to the
console — use those to log in as a client. The admin password is whatever
`ADMIN_PASSWORD` is set to in your `.env`.

## How a scan works

1. `startAuditAction` (`src/lib/actions/audit.ts`) creates the audit row with an engine roster (one row per engine: `live` or `not_configured`), issues a claim cookie, and kicks the first tick with `after()`.
2. `POST /api/audits/[id]/tick` advances the scan by one unit of work; the running page keeps calling it until the scan completes. Any tick from any instance resumes a stalled scan, and admins can resume from `/admin/scans`.
   - **site** stage — `src/lib/scan/siteScan.ts` fetches the homepage, `robots.txt`, `llms.txt` and the sitemap through an SSRF-safe fetcher and records structured data, NAP, hours, FAQ, rendering and crawler access. `resolveBusiness.ts` infers the category; `prompts.ts` generates the fixed prompt set; one `EngineRun` row is created per prompt × live engine × run.
   - **queries** stage — each tick claims a small batch of pending runs (with a lease, so a killed tick is retried), calls the engine through `src/lib/providers/*` with its native web search, stores the answer, every citation with its trust tier and supported passage, mention position, sentiment, accuracy and competitors.
   - **finalize** stage — competitors are aggregated, `src/lib/scoring` computes the versioned score, and `ScoreBreakdown` + `Report` rows are written.
3. `/audit/[id]/results` renders the report from those rows; `/api/audits/[id]/pdf` exports it.

Engines are enabled only when their key is present. With `MOCK_MODE=true` the whole flow runs on labelled fixtures (`src/lib/providers/mock.ts`); mock scans are flagged in the database and banner-labelled in the UI, and mock mode refuses to run on a deployed environment.

## Email and support pipeline

- `src/lib/email/` sends through the Resend REST API with plain `fetch`, logs every attempt to `EmailEvent`, and never throws. Emails go out with `after()` so a delivery problem never blocks a form.
- Team alerts: audit started (the first form), new lead (the account form, with goals, score and a link to the client), new support message. Client emails: welcome, "we received your message", and a copy of every team reply.
- Support threads live in `SupportThread` / `SupportMessage`; clients use `/dashboard/support`, the team uses `/admin/support`. Statuses: `open` (waiting on us), `answered`, `closed`.
- The Calendly link comes from `NEXT_PUBLIC_CALENDLY_URL` (placeholder until set).

Deploying: see [docs/DEPLOY.md](docs/DEPLOY.md). The build runs `scripts/migrate-deploy.mjs`, which baselines a database that predates migrations once and then applies the pending migrations.

## Tech stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com)
- [Prisma](https://www.prisma.io) + [Postgres (Neon)](https://neon.tech)
- Deployed on [Vercel](https://vercel.com)
