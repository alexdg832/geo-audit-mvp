# TrueSource

TrueSource is a GEO (Generative Engine Optimization) audit MVP. It audits how AI
assistants like ChatGPT and Claude describe a business, grades the trustworthiness
of the sources they're pulling from, and helps the business fix what's wrong. No
paid API keys are required.

Live demo: **https://geo-audit-mvp.vercel.app**

## Quickstart

Data is stored in Postgres (via [Neon](https://neon.tech), provisioned through the
Vercel Marketplace in production). For local dev, point `DATABASE_URL` /
`DATABASE_URL_UNPOOLED` at any Postgres database — a free Neon project works well.

```bash
cp .env.example .env   # then fill in your Postgres connection strings
npm install
npx prisma db push     # syncs the schema — run again after schema changes
npx prisma db seed     # loads demo client + demo admin data — optional but recommended
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

If this repo is linked to the Vercel project (`vercel link`), you can instead run
`vercel env pull .env --environment=preview` — note that the database URLs are
marked "Sensitive" in Vercel and won't come through via CLI pull; toggle that off
in the dashboard (Settings → Environment Variables) if you want local dev wired
to the same database.

## Environment variables

Set in `.env` (see `.env.example`):

- `DATABASE_URL` / `DATABASE_URL_UNPOOLED` — Postgres connection strings (pooled and direct). Neon provides both automatically on Vercel.
- `SESSION_SECRET` — secret used to sign client session cookies.
- `ADMIN_PASSWORD` — the password that gates `/admin`.
- `AUDIT_DEMO_FAST` — set to `"true"` to shorten the ~60–90s audit run to ~10s, handy for fast manual testing.

## Walking through the app

**As a business owner:**

1. Land on the homepage and start an audit for your business.
2. Watch the audit run, then view the results (score, source trust, consistency, AI readiness, AI visibility).
3. Click "Fix this with us" to either book a call or skip straight to a client account.
4. Land on your client dashboard, where you can track your Truth Brief and content pushes over time.

**As an admin:**

1. Go to `/admin/login` and enter `ADMIN_PASSWORD`.
2. Open the seeded demo client (or any real client that signed up).
3. Write a Truth Brief, create or update content pushes, and send a notification.
4. Check the client dashboard — the notification shows up there as unread.

## Demo accounts

Running `npx prisma db seed` prints a demo client email and password to the
console — use those to log in as a client. The admin password is whatever
`ADMIN_PASSWORD` is set to in your `.env`.

## Where the mocks are, and where to plug in real APIs

The audit pipeline has one real check and several mocked ones:

- `src/lib/audit/checks/website.ts` — **real.** Actually fetches the given website, its `robots.txt`, and `llms.txt`. No API key needed.
- `src/lib/audit/mocks/mentions.ts` — mocked. In production, replace with a real search/mention-discovery API plus an LLM pass to classify source tier and accuracy.
- `src/lib/audit/mocks/consistency.ts` — mocked. In production, replace with a real NAP (name/address/phone) consistency check across the gathered mentions.
- `src/lib/audit/mocks/aiVisibility.ts` — mocked. In production, replace with real prompts sent to AI assistant APIs (ChatGPT/Claude/Perplexity) asking what they know about the business.
- `src/lib/audit/mocks/aiSnippet.ts` — mocked. In production, replace with a real captured AI assistant response, with claims cross-checked against the Truth Brief.

Other things worth knowing:

- Real email sending is out of scope for this MVP — look for `TODO` markers wherever it would plug in.
- The Calendly URL in `config/site.ts` is a placeholder — swap it for a real scheduling link before launch.

## Tech stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS](https://tailwindcss.com)
- [Prisma](https://www.prisma.io) + [Postgres (Neon)](https://neon.tech)
- Deployed on [Vercel](https://vercel.com)
