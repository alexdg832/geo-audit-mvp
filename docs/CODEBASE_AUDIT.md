# Codebase audit — TrueSource GEO audit MVP

Date: 2026-09-29. Branch: `feat/geo-audit-engine-upgrade` (from `main` at `9c32d50`).
Purpose: map what exists before the scan, scoring, evidence and report upgrade; record what is weak; state the plan.

## 1. Stack

| Layer | What is used | Notes |
|---|---|---|
| Framework | Next.js 16.3.6 App Router, React 19.2.8, TypeScript 5 strict | `AGENTS.md` points at `node_modules/next/dist/docs/` — the local docs are authoritative for this version |
| Styling | Tailwind CSS 4, one accent token (`--accent: #4f46e5`) in [src/app/globals.css](../src/app/globals.css) | Light theme only; stone palette; Geist fonts via `next/font` |
| Data | Prisma 6.19.3, Postgres (Neon through the Vercel Marketplace) | `datasource` needs both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` ([prisma/schema.prisma:5-9](../prisma/schema.prisma#L5-L9)) |
| HTML parsing | cheerio | Used only by the website check |
| Tooling | ESLint 9 (`eslint-config-next`), `tsx` for the seed | No test runner, no `typecheck` script, no CI config, no git hooks |
| Deploy | Vercel project `gratul/geo-audit-mvp` | `DATABASE_URL*` exist only in Preview/Production and are marked Sensitive, so they never come through `vercel env pull` ([README.md:26-30](../README.md#L26-L30)) |

Build script ([package.json:10](../package.json#L10)): `prisma generate && prisma db push --accept-data-loss && next build`. There is no `prisma/migrations/` directory; the schema is pushed at build time with data-loss acceptance.

Path aliases: `@/*` → `src/*`, `@config/*` → `config/*` ([tsconfig.json:21-24](../tsconfig.json#L21-L24)).

## 2. Folder map

```
config/site.ts                     name, slogan, placeholder Calendly URL
prisma/schema.prisma               Business, Audit, SourceMention, User, ContactRequest, TruthBrief, ContentPush, Notification
prisma/seed.ts                     wipes all tables, creates one demo business/audit/user
src/app/page.tsx                   landing + AuditForm
src/app/audit/[id]/running         progress page (polls a server action every 1s)
src/app/audit/[id]/results         results page (score gauge, 4 category bars, AI snippet, checklist, sources, top fixes)
src/app/audit/[id]/contact         create account: book a call or skip
src/app/login, src/app/dashboard   client login + dashboard (latest audit, content-push timeline, notifications)
src/app/admin/login, /admin        password gate, client list
src/app/admin/clients/[id]         client detail: profile, latest audit link, Truth Brief, content pushes, notifications
src/lib/actions/*.ts               Server Actions: audit, auth, adminAuth, admin, contact, notifications
src/lib/audit/runAudit.ts          the pipeline (5 steps)
src/lib/audit/checks/website.ts    the only real check
src/lib/audit/mocks/*.ts           seeded-random fakes: mentions, consistency, aiVisibility, aiSnippet
src/lib/audit/score.ts             category weights and grade bands
src/lib/audit/recommendations.ts   templated "top fixes"
src/lib/auth/*.ts                  HMAC-signed cookie sessions, scrypt passwords
src/lib/db.ts                      PrismaClient singleton
src/components/**                  UI: Card, Button/LinkButton, Tooltip, GeoTerm, ScoreGauge, CategoryBar, SourceTierList,
                                   AiSnippetBlock, WebsiteChecklist, AuditProgress, forms, admin forms
```

## 3. How an audit runs today

1. [src/app/page.tsx](../src/app/page.tsx) renders `AuditForm`; submit calls `startAuditAction` ([src/lib/actions/audit.ts:9](../src/lib/actions/audit.ts#L9)), which creates a `Business` and an `Audit` and then calls `void runAudit(audit.id)` ([line 35](../src/lib/actions/audit.ts#L35)) — fire-and-forget inside a Server Action — before redirecting to `/audit/[id]/running`.
2. `runAudit` ([src/lib/audit/runAudit.ts:48](../src/lib/audit/runAudit.ts#L48)) runs five steps sequentially and writes `stepsJson` after each. Timing is simulated (`simulateWork` 1.2–4 s per step, ÷6 under `AUDIT_DEMO_FAST`).
3. Step "website" is real: `checkWebsite` ([src/lib/audit/checks/website.ts:103](../src/lib/audit/checks/website.ts#L103)) fetches the homepage, `robots.txt` and `llms.txt`; parses title, meta description, JSON-LD (`Organization`/`LocalBusiness` only), an "about" link, and phone/address regexes; checks root `Disallow` for GPTBot, ClaudeBot, PerplexityBot.
4. Steps "mentions", "sourceTrust", "aiReadiness" are fed by mocks: `generateMockMentions` (2–4 tier-1, 2–4 tier-2, 1–4 tier-3 templated mentions with templated inaccuracies, [mocks/mentions.ts:41-46](../src/lib/audit/mocks/mentions.ts#L41-L46)), `generateMockConsistency` (ratio drawn from 0.55–0.97, [mocks/consistency.ts:20](../src/lib/audit/mocks/consistency.ts#L20)), `generateMockAiVisibility` (70 % chance "mentioned", [mocks/aiVisibility.ts:12](../src/lib/audit/mocks/aiVisibility.ts#L12)), `generateMockAiSnippet` (templated false claims). All are deterministic per business name through `SeededRandom` ([src/lib/audit/seed.ts](../src/lib/audit/seed.ts)), so the same input always produces the same fabricated story.
5. Score ([src/lib/audit/score.ts:9-14](../src/lib/audit/score.ts#L9-L14)): Source Trust 35 + Consistency 25 + AI Readiness 25 + AI Visibility 15. Only AI Readiness (25 of 100 points) is derived from real data. Grade bands: ≥75 "Strong", ≥50 "Getting There", else "Needs Work" ([lines 100-104](../src/lib/audit/score.ts#L100-L104)).
6. Recommendations ([src/lib/audit/recommendations.ts](../src/lib/audit/recommendations.ts)) are one template sentence per category, top three by point gap.
7. Results are persisted on `Audit` as four integer columns plus three JSON strings, and as `SourceMention` rows ([runAudit.ts:94-120](../src/lib/audit/runAudit.ts#L94-L120)). The results page reads them back ([src/app/audit/[id]/results/page.tsx:20-29](../src/app/audit/%5Bid%5D/results/page.tsx#L20-L29)).
8. The running page's `AuditProgress` polls `getAuditStatus` every second ([src/components/AuditProgress.tsx:37-45](../src/components/AuditProgress.tsx#L37-L45)) and navigates to results on `complete`.

## 4. Data model and who reads what

| Reader | Reads | Must keep working |
|---|---|---|
| Admin list [src/app/admin/page.tsx:11-19](../src/app/admin/page.tsx#L11-L19) | `Business` with `users`, latest complete `Audit` (`score`, `completedAt`), latest `ContentPush` | yes |
| Admin detail [src/app/admin/clients/[id]/page.tsx:20-38](../src/app/admin/clients/%5Bid%5D/page.tsx#L20-L38) | `truthBrief`, `users` + `contactRequests`, `contentPushes`, latest complete `Audit` (`id`, `score`) | yes |
| Client dashboard [src/app/dashboard/page.tsx:18-27](../src/app/dashboard/page.tsx#L18-L27) | latest complete `Audit` (`score` + four category columns), `contentPushes` | yes — the four `CategoryBar`s read `sourceTrustScore`, `consistencyScore`, `aiReadinessScore`, `aiVisibilityScore` |
| Results page | `Audit` columns + JSON blobs + `SourceMention` rows | legacy audits must still render |
| Contact page | `Audit` → `Business` → `users` | yes |

`SourceMention.tier` is 1/2/3 with 3 = low-trust ([prisma/schema.prisma:50](../prisma/schema.prisma#L50)); the upgrade requires four tiers. `Audit.stepsJson`, `websiteChecksJson`, `aiSnippetJson`, `recommendationsJson` are JSON-in-string columns — fine for blobs, unqueryable for evidence.

## 5. Security posture

Good:
- No secret is hardcoded; `SESSION_SECRET` is required at runtime ([src/lib/auth/signedToken.ts:5-11](../src/lib/auth/signedToken.ts#L5-L11)); no `NEXT_PUBLIC_` secrets exist.
- `.gitignore` ignores `.env*` except `.env.example`; `git ls-files | grep -i env` returns only `.env.example`. Verified 2026-09-29.
- Session cookies are `httpOnly`, `secure` in production, `sameSite: lax` ([src/lib/auth/session.ts:13-19](../src/lib/auth/session.ts#L13-L19)); tokens are HMAC-SHA256 with `timingSafeEqual`; passwords use scrypt with a per-user salt.

Weak:
- **Admin Server Actions are unauthenticated.** `saveTruthBriefAction`, `createContentPushAction`, `updateContentPushStatusAction`, `sendNotificationAction` in [src/lib/actions/admin.ts](../src/lib/actions/admin.ts) never call `isAdmin()`; only the page that renders the forms is gated. Server Actions are plain POST endpoints, so anyone can write a Truth Brief, create content pushes, or push notifications to any business id. High.
- **No rate limiting or bot protection on the public audit start** ([src/lib/actions/audit.ts:9](../src/lib/actions/audit.ts#L9)). Harmless today (mocks); expensive once each submission triggers paid provider calls. High after the upgrade.
- **Website fetcher has no SSRF guard**: follows redirects, no private-IP/loopback block, no response-size cap ([src/lib/audit/checks/website.ts:45-57](../src/lib/audit/checks/website.ts#L45-L57)). Medium.
- Admin password compare uses `!==` ([src/lib/actions/adminAuth.ts:16](../src/lib/actions/adminAuth.ts#L16)) and has no attempt limiting. Low.
- `prisma db push --accept-data-loss` on every production build. Medium (data-loss hazard on any destructive schema change).
- Results and report pages are readable by anyone holding the cuid. Acceptable for a shareable free audit; the paid report should keep that property deliberately (share link) rather than by accident.

## 6. What is weak, ranked

1. **The score is fabricated for 75 of 100 points.** Only the website check is real. Customer-facing text such as "Confuses this business with a similarly named company in another city" comes from templates, not evidence. This is disqualifying for a paid report.
2. **Execution model cannot survive Vercel.** `void runAudit()` inside a Server Action ([src/lib/actions/audit.ts:35](../src/lib/actions/audit.ts#L35)) may be frozen once the redirect response is sent; audits can stay `running` forever. The code acknowledges this ([runAudit.ts:44-46](../src/lib/audit/runAudit.ts#L44-L46)). A real scan makes dozens of provider calls over several minutes and needs a resumable, idempotent step machine.
3. **No evidence model.** No prompts, engine responses, citations, passage spans, competitors, or per-run variance are stored — nothing a customer can click through to "see where the AI got this".
4. **Scoring is unversioned, untested, has no confidence, no caps, and is coupled to mock shapes** (`MockMention` is a scoring input, [score.ts:29](../src/lib/audit/score.ts#L29)).
5. **Website scan gaps.** JSON-LD detection only accepts the literal types `Organization` and `LocalBusiness` ([website.ts:134](../src/lib/audit/checks/website.ts#L134)), so a `Dentist`, `Restaurant` or `Plumber` (all `LocalBusiness` subtypes) counts as no schema — a false negative that would penalise well-marked-up sites. No sitemap, no JS-rendering detection, no page weight/speed, no `OAI-SearchBot`/`Claude-SearchBot`/`Perplexity-User`/`Google-Extended` user-agents, robots parsing ignores path-level rules and `Allow` precedence ([website.ts:60-101](../src/lib/audit/checks/website.ts#L60-L101)), "about page" means any link whose href contains "about" ([line 151](../src/lib/audit/checks/website.ts#L151)).
6. **Report is thin.** Five cards; no executive verdict, critical failures, methodology, evidence explorer, competitors, source map, cost of inaction, roadmap, or PDF.
7. **Admin has no operational view.** No provider status, no scan list, no raw evidence.
8. **No tests, no `typecheck` script, no CI.**
9. Minor: README tells developers to `cp .env.example .env` ([README.md:17](../README.md#L17)) — the project rule is `.env.local`; `hasAboutPage`/contact detection are heuristics that should be labelled as such in the methodology.

## 7. What works and stays

- Auth and sessions, admin gate, contact/skip account creation, client dashboard timeline, notifications, Truth Brief and content pushes — untouched except for adding the missing `isAdmin()` checks.
- UI primitives (`Card`, `Button`, `LinkButton`, `Tooltip`, `GeoTerm`, `ScoreGauge`, `CategoryBar`) and the stone/indigo design language — reused by the new report.
- The website check's structure (fetch with timeout, cheerio parse, robots parse) — extended, not rewritten.
- The poll-until-complete pattern in `AuditProgress` — extended into a client-driven step advancer.
- `SeededRandom` — reused for the labelled `MOCK_MODE` fixtures.

## 8. Provider keys detected (names only)

`.env.local` now contains: `OPENAI_API_KEY`, `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`, `RESEND_API_KEY`, `DATABASE_URL`, plus `SESSION_SECRET`, `ADMIN_PASSWORD`, `AUDIT_DEMO_FAST` pulled from Vercel. `DATABASE_URL_UNPOOLED` is absent.

Health checks against the real endpoints on 2026-09-29: the OpenAI and Anthropic values are rejected (401 — both end in a bare `$`, a copy-truncation artifact), the Perplexity key authenticates but the account has no credits, and the Gemini key (an `AQ.`-style key, which is valid) hits a quota/billing limit. The provider registry surfaces `live` / `not_configured` / `error` per engine in the admin Provider Status panel rather than trusting key presence alone; see `docs/UPGRADE_SUMMARY.md`.

## 9. Plan

**Phase 1 — research.** `docs/GEO_RESEARCH.md`: web research with a URL beside every claim, adversarially re-verified, plus the current request/response shapes of the four provider APIs.

**Phase 2a — provider layer** (`src/lib/providers/`):
- `types.ts`: `AIProvider.query(prompt, opts) → { answerText, citations[], model, latencyMs, rawResponse }` where each citation carries `url`, `domain`, `title`, and the supported character span when the engine provides one (Gemini `groundingSupports`, OpenAI `url_citation` indices, Anthropic `cited_text`); Perplexity gives ordered sources without spans, stored as such.
- One adapter per engine (`openai.ts`, `anthropic.ts`, `gemini.ts`, `perplexity.ts`) using plain `fetch` against the documented endpoints and native web-search/grounding tools, so the raw response is persisted verbatim.
- `registry.ts`: enables an adapter only when its key exists; `MOCK_MODE=true` swaps in `mock.ts` fixtures, refuses to run in production, and stamps every mock scan `isMock=true` so the report shows a banner and admin filters it out.
- `cache.ts`, `limits.ts`: DB-backed response cache keyed by `(engine, promptHash, date)`, per-scan call cap, per-call timeout, retry with backoff on 429/5xx, DB-backed rate limit on the public audit start (hashed IP per hour).
- Admin "Provider Status" page: live / missing key / last error per engine.

**Phase 2b — scan system** (`src/lib/scan/`):
- `resolveBusiness.ts`: normalise name, resolve website/category/location, detect ambiguity.
- `prompts.ts`: deterministic prompt set per category+location (recommendation, comparison, "best X near Y", direct brand), stored as `ScanPrompt` rows.
- `runScan.ts`: resumable step machine — `resolve → site → queries (engine × prompt × run) → analyse → score → report` — persisted per unit so any driver can advance it; driven by the running page polling an `advance` route with `maxDuration`, idempotent per `(prompt, engine, run)`.
- `analyse.ts`: mention detection, position, sentiment, accuracy against the site/Truth Brief, competitor extraction; `sources.ts`: domain → trust tier.
- `siteScan.ts`: extends the website check (LocalBusiness subtypes, sitemap, rendering, page weight, all AI user-agents, path-level robots).

**Phase 3 — scoring** (`src/lib/scoring/`): pure, versioned (`SCORING_VERSION`), six pillars with named sub-metrics normalised 0–1, median across runs, confidence from variance, documented hard caps, grade bands, `ScoreBreakdown` rows with points lost and evidence references; vitest fixtures for zero-visibility, average and strong businesses; `docs/SCORING_METHODOLOGY.md`.

**Phase 4 — report**: `src/app/report/[scanId]` with the required sections, and a PDF export route using `@react-pdf/renderer` (pure JS, no headless browser). Legacy audits keep rendering the old results page.

**Data model**: `Audit` is extended to be the scan record (every reader and every `/audit/[id]/*` URL already keys on it, so a separate 1:1 `Scan` table would only mean dual-writing status and score). It gains nullable scan columns (`scanVersion`, `scoringVersion`, `stage`, `isMock`, resolved business fields, cost counters, `requesterIpHash`, `error`, `lastProgressAt`); legacy columns stay and keep being read for pre-upgrade audits. New child tables keyed by `auditId` with cascades: `ScanEngine`, `ScanPrompt`, `EngineRun` (one row per prompt × engine × run, with `status`, `attempts`, `leaseUntil` so work is claimable and resumable), `Citation`, `SiteCheck`, `CompetitorDetected`, `ScoreBreakdown`, `Report`; plus `ProviderCache` keyed `(engine, promptHash, day, runIndex)` and `ProviderEvent`. `prisma/migrations/` holds a baseline of the pre-upgrade schema plus the upgrade migration; the build switches to `prisma migrate deploy`, and the existing production database needs a one-time `prisma migrate resolve --applied 20260929000000_init` (documented in the upgrade summary).

**Execution model**: work units persisted in Postgres and advanced by ticks. `startAuditAction` creates the audit, prompts and pending `EngineRun` rows in one transaction, then `after()` kicks the first tick. `POST /api/audits/[id]/tick` (a Route Handler with `maxDuration = 120`) atomically claims a small batch of pending units with a lease, runs them under per-call timeouts, writes each result to its own row, re-pends failures up to three attempts, and when nothing is left finalises scoring and the report exactly once. The running page loops on the tick endpoint (a route handler, not a Server Action, so polling is neither serialised behind other actions nor broken by action-ID rotation on deploy). Any tick from any instance resumes a stalled scan; an admin "Resume" button covers closed tabs.

**Tooling**: `vitest`, `typecheck` script, the secrets guard (done).

## 10. Independent review (five lenses + Next.js 16 docs digest + critic)

A parallel review — security, data model, scoring, UI/report and runtime lenses, three readers over `node_modules/next/dist/docs/`, and a completeness critic that re-verified the most consequential claims at the cited lines — confirmed sections 5–6 and added the following, all adopted in the plan above:

- **robots.txt parser bug** ([website.ts:77](../src/lib/audit/checks/website.ts#L77)): the user-agent group never resets, so a file that blocks only GPTBot is reported as blocking ClaudeBot and PerplexityBot too; `Allow` is ignored. Replaced by a spec-compliant parser with tests.
- **Fetch failure semantics**: a homepage timeout zeroes the whole readiness category while a robots.txt timeout awards full credit ([website.ts:168-170](../src/lib/audit/checks/website.ts#L168-L170), [score.ts:59-65](../src/lib/audit/score.ts#L59-L65)). New site checks carry an explicit `unknown` state that lowers confidence instead.
- **HTTPS is judged from the typed URL, not the server** ([website.ts:110](../src/lib/audit/checks/website.ts#L110)); redirects are followed but `res.url` is never read. Fixed via `finalUrl`.
- **`llms.txt` is "present" on any 2xx**, so SPA catch-alls pass ([website.ts:174](../src/lib/audit/checks/website.ts#L174)). Now requires a text content type and non-HTML body.
- **Account claim hijack** ([contact.ts:9-17](../src/lib/actions/contact.ts#L9-L17)): anyone holding an audit id can attach an account to its business; the page redirect is the only guard. Enforced in the action, plus a signed claim cookie issued at scan start.
- **Cache key must include the run index**: a cache keyed only by `(engine, prompt, day)` would return run 0's answer for every repeat and collapse the median to a single sample.
- **Seed wipes every table with no environment guard** while the README documents pointing local dev at the shared Neon database. The seed now refuses non-local hosts unless `SEED_RESET=1`.
- **`typecheck` needs `next typegen` first** (the global `PageProps`/`LayoutProps` helpers are generated); **Server Actions are dispatched sequentially per client** and their IDs rotate on deploy, so status polling moves to a GET route handler; **`after()` is bounded by the page's `maxDuration`**, which is why it kicks the first tick rather than running the whole scan.
- Next 16 rules applied to new code: `params`/`searchParams`/`cookies()` are Promises; `middleware.ts` is deprecated in favour of `proxy.ts`; Edge runtime is deprecated (stay on Node); `revalidateTag` needs a second argument; `use cache` is off (no `cacheComponents`) and would be per-instance memory on Vercel anyway, so provider caching lives in Postgres; `next build` no longer lints.
- Still open and deliberately deferred: session revocation (stateless HMAC tokens), a CSP, and connection-pool sizing for Neon under concurrent writers (unit results are written with `createMany` inside one transaction per tick to keep the write count low).

## 11. Open items for the owner

- A usable `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for local development. The pasted value is truncated. Options: un-mark Sensitive in Vercel and `vercel env pull .env.local --environment=preview`, or provide a spare Neon branch. Until then I develop and test against a local Postgres.
- Re-paste `CLAUDE_API_KEY` and `OPENAI_API_KEY` in full, and confirm the `GEMINI_API_KEY` value is an AI Studio API key.
- Rotate every key that was pasted into chat.
