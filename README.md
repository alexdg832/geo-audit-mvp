# TrueSource

TrueSource is a GEO (Generative Engine Optimization) audit MVP. It audits how AI
assistants like ChatGPT and Claude describe a business, grades the trustworthiness
of the sources they're pulling from, and helps the business fix what's wrong. No
paid API keys are required — everything runs fully locally on SQLite.

## Quickstart

```bash
cp .env.example .env
npm install
npx prisma migrate dev   # creates the local SQLite db — only needed once, or after schema changes
npx prisma db seed       # loads demo client + demo admin data — optional but recommended
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Environment variables

Set in `.env` (see `.env.example`):

- `DATABASE_URL` — the SQLite database file used by Prisma. Defaults to `file:./dev.db`.
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
- [Prisma](https://www.prisma.io) + SQLite
- No external services required
