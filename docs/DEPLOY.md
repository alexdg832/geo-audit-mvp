# Going live on Vercel

Step-by-step for taking the `feat/geo-audit-engine-upgrade` branch from your laptop to the
Vercel project `geo-audit-mvp` (GitHub repo `alexdg832/geo-audit-mvp`). Nothing on this
branch is deployed until you push it; Vercel builds only what is on GitHub.

The order matters: **environment variables and the database baseline come before the first
push**, otherwise the first build fails at the migration step.

## 1. Collect the values you need

| Variable | Where it is used | Notes |
|---|---|---|
| `SESSION_SECRET` | signs login cookies | any long random string; `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | gates `/admin` | choose a real one |
| `OPENAI_API_KEY` | ChatGPT engine | must be the **full** key (the one pasted earlier was cut off) |
| `CLAUDE_API_KEY` | Claude engine | same, full key |
| `GEMINI_API_KEY` | Gemini engine | key is valid; the Google project needs billing/quota |
| `PERPLEXITY_API_KEY` | Perplexity engine | key is valid; the account needs credits |
| `RESEND_API_KEY` | all email | key is valid today |
| `ADMIN_NOTIFY_EMAIL` | where lead/support alerts go | until a domain is verified in Resend this must be the address that owns the Resend account |
| `RESEND_FROM_EMAIL` | sender on outgoing email | only after you verify a domain at resend.com/domains, e.g. `TrueSource <hello@yourdomain.com>` |
| `APP_URL` | links inside emails | optional; defaults to the Vercel production URL |
| `NEXT_PUBLIC_CALENDLY_URL` | booking button + inline embed | your real Calendly event link |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Postgres | already set by the Neon integration; leave them |

Do **not** set `MOCK_MODE` on Vercel (the app refuses to run mock mode on a deployed
environment). Delete the old `AUDIT_DEMO_FAST` variable; nothing reads it any more.

Every key that was ever pasted into a chat should be rotated at the provider first, and the
new value used below.

## 2. Put the variables into Vercel

Dashboard route: **vercel.com → geo-audit-mvp → Settings → Environment Variables**.
For each variable click *Add*, paste the value, tick **Production** and **Preview**, save.

Or from the terminal (it prompts for the value, so nothing lands in your shell history):

```bash
vercel env add SESSION_SECRET production
vercel env add SESSION_SECRET preview
# repeat for every variable in the table
vercel env rm AUDIT_DEMO_FAST production
```

## 3. Baseline the production database (one time only)

The build now runs `prisma migrate deploy`. Your Neon database was created with
`prisma db push`, so Prisma has no record of which migrations are applied. Tell it that the
first migration (the schema as it exists today) is already there:

1. In Vercel, open **Settings → Environment Variables**, find `DATABASE_URL_UNPOOLED`
   (Production) and reveal its value.
2. On your laptop, from the project folder:

```bash
DATABASE_URL="<paste the unpooled url>" DATABASE_URL_UNPOOLED="<paste the unpooled url>" \
  npx prisma migrate resolve --applied 20260929000000_init

DATABASE_URL="<same>" DATABASE_URL_UNPOOLED="<same>" npx prisma migrate status
```

`migrate status` should list `20260929000000_init` as applied and the two newer migrations
(`20260930001445_scan_evidence_scoring`, `20260930020000_support_email`) as pending. The
build applies those two.

If Preview deployments use a **separate** database that already has the old tables, repeat
the same two commands with that database's URL. If Preview uses a fresh, empty database, skip
this; `migrate deploy` creates everything from scratch.

## 4. Push the branch (Preview deployment)

```bash
cd "/Users/alejandroduartegonzalez/Desktop/GEO Optimization"
git push -u origin feat/geo-audit-engine-upgrade
```

Vercel picks the branch up automatically and builds a Preview. In the Vercel dashboard open
the deployment and check the build log: you should see `prisma migrate deploy` apply the two
migrations, then `next build` finish. Open the preview URL and check:

- `/admin/login` with `ADMIN_PASSWORD`, then **Provider status → Run health checks**. Any
  engine still showing an error tells you exactly which key or billing issue remains.
- Start an audit from the homepage. It should complete with whichever engines are live.
- **Admin → Support** and the **Email delivery** card on Provider status show what was sent.

## 5. Promote to production

Open a pull request on GitHub from `feat/geo-audit-engine-upgrade` into `main` and merge it,
or merge locally:

```bash
git checkout main
git merge --ff-only feat/geo-audit-engine-upgrade
git push origin main
```

The push to `main` triggers the Production deployment at `https://geo-audit-mvp.vercel.app`
(and any custom domain attached to the project).

## 6. After the first production deploy

1. Log in to `/admin`, run the health checks, and fix any remaining key/billing issue.
2. Run one real audit end to end and read the report.
3. Fill in the account form once yourself: the team inbox should receive a "New lead" email
   and the address you used should receive the welcome email. If the welcome email shows as
   *failed* in the Email delivery log with a 403, verify a domain in Resend and set
   `RESEND_FROM_EMAIL`.
4. Send a support message from the client dashboard and answer it from **Admin → Support**.
5. Replace the placeholder booking link by setting `NEXT_PUBLIC_CALENDLY_URL` and redeploying.

## Project settings worth checking once

- **Settings → General → Node.js Version**: 22.x or 24.x (the project declares `node >= 22`).
- **Settings → Functions**: the default 300 s limit is enough; the scan tick route asks for 120 s.
- **Storage → Neon**: the connection strings should stay marked *Sensitive*; the app never
  prints them.
