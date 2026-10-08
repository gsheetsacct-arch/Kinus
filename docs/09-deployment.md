# 9. Deployment: Supabase + GitHub → Vercel + Resend

## 9.1 Environments

| Environment | Supabase | Vercel | Branch | Purpose |
|---|---|---|---|---|
| Local | `supabase start` (Docker) or a dev project | `next dev` | feature branches | Development, migration authoring |
| Preview | Supabase **staging** project | Vercel preview deployments | pull requests | Review with realistic data (anonymised copy) |
| Production | Supabase **prod** project | Vercel production | `main` | Camp operations |

Two Supabase projects (staging, prod) rather than Supabase branching: simpler,
cheaper, and staging can hold a scrubbed copy of the roster for testing imports.

## 9.2 Supabase setup (once)

1. Create projects `kinus-staging`, `kinus-prod` (region closest to Crown Heights:
   `us-east-1`).
2. Enable extensions `unaccent`, `pg_trgm` (the migration does it; they are
   available on Supabase).
3. Auth: enable Email provider; disable public sign-ups (invite only); set site URL
   and redirect URLs to the Vercel domains; set JWT expiry 3600 s; custom SMTP
   through Resend so invite/magic-link emails come from your domain.
4. Storage: buckets `imports`, `templates`, `print-output` (created by migration),
   all private; a policy allowing admins to read/write `imports` and `templates`,
   office+admins to read `print-output`.
5. Realtime: enable for `attendance_events`, `campers`, `print_jobs`, `page_requests`
   (`alter publication supabase_realtime add table …`, add to migration 0002).
6. Create the first owner: sign up via the dashboard, then
   `update profiles set global_role = 'owner'` (a seed script does this from an env
   var `BOOTSTRAP_OWNER_EMAIL`).
7. Database backups: Supabase daily backups (Pro plan) plus a nightly
   `pg_dump` GitHub Action to a private artifact during the program week.

Migrations: Supabase CLI. `supabase/migrations/*.sql` are applied by CI
(`supabase db push`) on merge to `main` (prod) and on PR (staging). Generated
TypeScript types (`supabase gen types`) are committed so the app compiles against
the real schema.

## 9.3 GitHub

- Repo `gsheetsacct-arch/Kinus`, default branch `main`, PRs required, squash merge.
- Workflows:
  - `ci.yml`: install, typecheck, lint, unit tests (Vitest), Playwright smoke on a
    Supabase local instance (service container) — runs on every PR.
  - `db-staging.yml`: `supabase db push` to staging on PR open/update (link via
    `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_STAGING`).
  - `db-prod.yml`: `supabase db push` to prod on push to `main`, *before* Vercel
    builds (Vercel deploy is triggered by a deploy hook at the end of this job rather
    than by the Git integration, so code never ships ahead of its schema).
  - `backup.yml`: nightly dump during the program window.
- Secrets live in GitHub Environments (`staging`, `production`) with required
  reviewers on `production`.

## 9.4 Vercel

- Project linked to the repo; Production branch `main`; previews for PRs
  (triggered by the deploy hook from the db workflow, Git auto-deploy disabled).
- Node runtime for `/api/print/*` (Chromium); set `maxDuration = 60` on that route.
  The `@sparticuz/chromium` package stays under the 50 MB function limit; verify in
  the first preview.
- Cron (`vercel.json`): `/api/cron/print-jobs` every minute,
  `/api/cron/daily-summary` at the configured hour (`/api/cron/pager-sweep` only
  when the pager feature is enabled). Cron routes check
  the `CRON_SECRET` header.
- Env vars (per environment):

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | anon key is safe to expose; RLS does the work |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | import apply, print worker, email, undo window |
| `RESEND_API_KEY` | server only | |
| `RESEND_WEBHOOK_SECRET` | server only | delivery events |
| `EMAIL_FROM` | server | `Kinus Tags <tags@your-domain>` |
| `CRON_SECRET` | server | |
| `APP_URL` | server | links in emails |
| `BOOTSTRAP_OWNER_EMAIL` | server | first-run only |

- Custom domain (e.g. `kinus.your-domain`), HTTPS automatic. PWA requires HTTPS,
  which previews and prod both have.
- Vercel Firewall: rate-limit `/login` and `/api/*`; optional IP allow-list is
  **not** advised (staff are on phones).

## 9.5 Resend

- Add and verify the sending domain (DKIM, SPF, DMARC `p=quarantine`).
- API key per environment (staging key sends only to a test inbox via Resend's
  test mode or a `EMAIL_OVERRIDE_TO` env var in non-prod).
- Webhook → `/api/webhooks/resend` for `email.delivered` / `email.bounced`.
- Also configured as Supabase Auth's custom SMTP (`smtp.resend.com`), so staff
  invites and magic links carry your branding and are not rate-limited by Supabase's
  default sender.

## 9.6 Operations during the program

- Status page for staff: `/health` shows DB reachable, last cron run,
  queue depths. Directors check it in the morning.
- A "today" switch in Settings (arrival day / normal / pickup day) changes the
  default scan mode on all devices.
- Logs: Vercel + Supabase; errors surfaced in-app on the admin dashboard
  (`print_jobs.failed`, `page_requests.failed`, last import error).
- After the program: set the session inactive; data stays readable; create next
  year's session and import again. `camper_code`s are never reused.

## 9.7 Cost (indicative)

Supabase Pro (~$25/mo, needed for daily backups and better auth limits), Vercel
Hobby/Pro (Pro ~$20/mo if more than one collaborator or cron minute granularity is
needed; Hobby cron is daily only, so **Pro is required** for the minute sweep),
Resend free tier (3 000 emails/month) is enough for tag requests and invites.
