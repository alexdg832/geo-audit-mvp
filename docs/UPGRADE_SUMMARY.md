# Upgrade summary — GEO audit engine

Branch: `feat/geo-audit-engine-upgrade` (local commits only, nothing pushed). Baseline: `main` at `9c32d50`. Date: 2026-09-29/30.

## What changed

**Security and setup**
- Secrets live only in `.env.local`; `.env.example` documents every variable with placeholders. `scripts/check-secrets.mjs` scans staged files for key-like strings (`npm run check-secrets`; opt-in pre-commit hook under `scripts/git-hooks/`). Verified that no `.env*` file other than `.env.example` was ever tracked.
- The Vercel-pulled `.env` (blank database URLs, `VERCEL_ENV=preview`) was moved to `.env.vercel-pulled.bak` because Next.js and Prisma auto-load `.env` and it made local runs look like a Vercel preview.
- Local development database: embedded Postgres (`npm run db:dev`), `prisma.config.ts` loads `.env.local` for the Prisma CLI, and the seed refuses to wipe a non-local database.
- Admin Server Actions now check the admin session; account claiming requires the signed cookie issued when the audit was started and refuses already-claimed businesses; re-running an audit requires ownership or admin; anonymous starts are rate limited per hashed IP and globally; the site fetcher blocks private address ranges and caps body size and time; security headers are set in `next.config.ts`; citation links are rendered only for `http(s)` URLs.

**Data model** ([prisma/schema.prisma](../prisma/schema.prisma), migrations `20260929000000_init`, `20260930001445_scan_evidence_scoring`, `20260930020000_support_email`)
- `Audit` is the scan record (extended, not replaced, so every existing URL and dashboard query keeps working). New tables: `ScanEngine`, `ScanPrompt`, `EngineRun`, `Citation`, `SiteCheck`, `CompetitorDetected`, `ScoreBreakdown`, `Report`, `ProviderCache`, `ProviderEvent`, and for customer service `SupportThread`, `SupportMessage`, `EmailEvent`.
- Build now runs `prisma migrate deploy` instead of `prisma db push --accept-data-loss`.

**Provider layer** ([src/lib/providers/](../src/lib/providers/))
- `AIProvider` interface; adapters for OpenAI (Responses API `web_search`, `url_citation` spans), Anthropic (Messages API `web_search` server tool, citation blocks with `cited_text`), Gemini (`google_search` grounding with `groundingSupports` byte spans converted to character spans, redirect URLs resolved), Perplexity (Sonar `search_results`, `[n]` markers mapped to sentences). Plain `fetch`, no SDKs, raw responses persisted.
- Registry enables an adapter only when its key exists; `MOCK_MODE=true` swaps in a labelled fixture engine and is refused on deployed environments.
- Cost controls: per-scan call cap (only successful calls count), same-day cache keyed by engine + prompt + day + run index, 60 s per-call timeout, retries with backoff on 429/5xx/network, and a per-engine circuit breaker for auth/billing/quota errors.
- Admin **Provider status** page (`/admin/providers`): live / not configured / error per engine, model, last success, last error, on-demand health checks.

**Scan system** ([src/lib/scan/](../src/lib/scan/))
- Resumable work units: the audit action creates the scan and kicks the first tick with `after()`; `POST /api/audits/[id]/tick` advances one batch under a lease; the running page loops on it; `/admin/scans` lists scans and can resume stalled ones.
- Site scan with a spec-compliant robots.txt parser (the old one mis-attributed bot-specific blocks), LocalBusiness subtype detection through `@graph`, NAP, hours, FAQ, About, rendering, sitemap, `llms.txt` content validation, per-crawler access for 16 AI user-agents.
- Business resolution (name keywords first, then schema type, then site text), a fixed six-prompt set per category and location, mention detection with spans and echo detection, classifier-based sentiment, accuracy and competitor extraction, four-tier source classification.

**Scoring** ([src/lib/scoring/](../src/lib/scoring/), [SCORING_METHODOLOGY.md](SCORING_METHODOLOGY.md))
- Six pillars, 26 named sub-metrics normalised to 0–1, medians across repeated runs, confidence per pillar, four documented hard caps, five grade bands, critical failures, prioritised roadmap, labelled cost-of-inaction estimate, `SCORING_VERSION` stored per report. Fixture tests for zero-visibility, average and strong businesses plus each cap.

**Report** ([src/app/audit/[id]/results](../src/app/audit/%5Bid%5D/results/page.tsx), [src/components/report/](../src/components/report/))
- Executive summary, critical failures, pillar breakdown with points lost, evidence explorer (filter by engine and prompt; highlighted mention and source-supported passages; tier-badged links; "No source provided by this engine"), competitor comparison, source map by tier with a tier-4 warning, cost of inaction with visible assumptions, roadmap with fix steps behind the CTA, "How we score" panel. PDF export at `/api/audits/[id]/pdf`. Legacy audits still render the old page. The client dashboard shows the six pillars and links to the report.

**Removed**: the seeded-random mock pipeline (`runAudit`, `mocks/*`, `steps`, `recommendations`, the old website check) — 75 of 100 points used to come from fabricated findings.

**Onboarding emails and support pipeline** ([src/lib/email/](../src/lib/email/), [src/lib/actions/support.ts](../src/lib/actions/support.ts), migration `20260930020000_support_email`)
- Resend transport over plain `fetch` (documented `POST /emails` body, `Idempotency-Key`), every attempt recorded in `EmailEvent` as sent / failed / skipped with the provider's reason; keys are never logged. Emails are queued with `after()` so they never delay or fail a form.
- Team alerts to `ADMIN_NOTIFY_EMAIL`: audit started (the first form a visitor fills), new lead (account form: contact, goals, score, link to the client), new support message. Client emails: welcome (with the Calendly link when they asked for a call), receipt of a new conversation, and a copy of each team reply. `reply_to` is set so an email reply reaches the other side directly.
- Support threads (`SupportThread`, `SupportMessage`): clients write and read everything at `/dashboard/support` (threads, replies, their goals, booking); the team answers from `/admin/support` (inbox with status filters, thread view, close/reopen). A team reply also creates an in-app notification. Client messages are capped at 20 per hour per business.
- Admin **Provider status** gained an email delivery card (configuration, sandbox warning, last 15 emails). The Calendly link is now `NEXT_PUBLIC_CALENDLY_URL` with an inline embed when set.
- Verified on 2026-09-30 against the live Resend API: the key works; with no verified domain Resend refuses recipients other than the account owner (HTTP 403, recorded in the log), which is the expected sandbox behaviour until a domain is verified.

## Engines live during testing

None. Every adapter was exercised against its real endpoint on 2026-09-29 and each failed before returning an answer, for reasons outside the code:

| Engine | Result | What is needed |
|---|---|---|
| ChatGPT (OpenAI) | HTTP 401 `invalid_api_key` — the provided key ends in a literal `$`, a copy truncation | Re-paste the full key into `.env.local` |
| Claude (Anthropic) | HTTP 401 `authentication_error` — same truncation | Re-paste the full key |
| Perplexity | HTTP 401 `insufficient_quota` — the key is valid, the account has no credits | Add credits at the Perplexity console |
| Gemini | HTTP 429 `RESOURCE_EXHAUSTED` — the key is valid, the project's quota/billing is exhausted; the API also retired `gemini-2.5-flash` for new users (default moved to `gemini-3.8-flash`) | Enable billing or wait for quota; confirm the model |

The circuit breaker handled all four correctly (each engine tripped on first contact, no budget consumed). The whole flow — site scan, prompt set, units, ticks, analysis, scoring, report, PDF, dashboards — was verified end to end in `MOCK_MODE`, plus the real site scan against a live website. **All keys pasted into chat should be rotated**; the transcript contains them.

## What still needs a key or credits

- Any real scan: at least one working engine (see the table). With none live, scans complete with the `no_live_engines` cap (score ≤ 40, confidence low) and the report says so.
- The answer classifier (sentiment, accuracy, competitor extraction) needs a search-free completion from OpenAI, Anthropic or Gemini; without one, mentions still come from text matching and position falls back to list rank.
- Email to clients needs a verified sending domain in Resend plus `RESEND_FROM_EMAIL`; team alerts need `ADMIN_NOTIFY_EMAIL` (until the domain is verified, that must be the Resend account owner's address).

## Deployment checklist

Full walkthrough: [DEPLOY.md](DEPLOY.md).

1. Add the provider keys, `SESSION_SECRET`/`ADMIN_PASSWORD`, `RESEND_API_KEY`, `ADMIN_NOTIFY_EMAIL` and `NEXT_PUBLIC_CALENDLY_URL` to the Vercel project (never `MOCK_MODE` on Preview/Production; the app refuses it). Remove the now-unused `AUDIT_DEMO_FAST`.
2. Migrations run in the build (`scripts/migrate-deploy.mjs`). The first build against the existing `db push`-managed database baselines it automatically (marks `20260929000000_init` as applied), then applies `20260930001445_scan_evidence_scoring` and `20260930020000_support_email`.
3. Keep the Vercel function limit at ≥ 120 s (the tick route exports `maxDuration = 120`).
4. Verify a sending domain in Resend and set `RESEND_FROM_EMAIL` so client emails deliver.

## Known limitations

- No live-engine validation yet (see above); adapter shapes follow the engines' documentation as researched in [GEO_RESEARCH.md](GEO_RESEARCH.md) §8 and should be confirmed with one real scan per engine as soon as a key works.
- Progress relies on the running page (or an admin resume) calling the tick endpoint; there is no cron sweep for scans abandoned mid-way.
- Site checks read the homepage only; trust tiers use domain lists; cost-of-inaction defaults are placeholders.
- Sessions are stateless HMAC tokens with no revocation; no CSP beyond `frame-ancestors`.
- Legacy audits keep their old page and score bands; re-running produces the new report.

## Next three improvements

1. **Run one real scan per engine and calibrate**: confirm citation shapes and spans on live responses, then tune the classifier prompt and the trust-tier lists against real citations.
2. **Scheduled sweep and report email**: a Vercel Cron that resumes stalled scans and emails the report link when a scan completes (the Resend transport is in place), so a closed tab never loses a paid audit; plus Resend inbound webhooks so a client's email reply lands in the support thread.
3. **Trend tracking**: keep per-business scan history (mention rate, share of voice, top competitor) and show the delta on the dashboard and in the report, which is the strongest retention hook for the service.
