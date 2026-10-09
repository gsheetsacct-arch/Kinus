# 9. Deployment: Supabase + GitHub → Vercel + Resend

## 9.1 Environments

| Environment | Supabase | Vercel | Branch | Purpose |
|---|---|---|---|---|
| Local | `supabase start` (Docker) or a dev project | `next dev` | feature branches | Development, migration authoring |
| Preview | Supabase **staging** project | Vercel preview deployments | pull requests | Review with realistic data (anonymised copy) |
| Production | Supabase **prod** project | Vercel production | `main` | Camp operations |

Two Supabase projects (staging, prod) rather than Supabase branching: simpler,
cheaper, and staging can hold a scrubbed copy of the roster for testing imports.

## 9.2 First-time setup, entirely in the browser (once)

Nothing here needs a computer with tools installed; everything happens in the
Supabase, Vercel and GitHub web UIs.

1. **Supabase project** exists and is linked to the Vercel project through the
   Vercel ↔ Supabase integration. That integration already sets
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` on Vercel. The only variable to add yourself is
   `APP_URL` (step 3).

2. **Apply the schema.** Two ways; pick one.

   **A. Supabase's GitHub integration (simplest).** Supabase dashboard →
   Integrations → GitHub → connect the repository. Settings:
   - *Working directory* (the folder that contains `supabase/`): leave blank or `.`
     — the `supabase/` folder is at the repository root.
   - *Production branch*: the branch the code lives on. Until a `main` branch
     exists that is `claude/gracious-noether-nc1kf8`.
   - *Deploy to production*: on. Every push to that branch then applies any new
     file in `supabase/migrations/` automatically.
   This integration is part of Supabase Branching (Pro plan). If it is not
   available on your plan, use B.

   **B. The repo's Setup workflow.** Collect three values from Supabase
   (Project Settings): the *Connect* → **Direct connection** URI with the password
   filled in (percent-encode special characters: `@` → `%40`, `#` → `%23`),
   *Data API* → **Project URL**, and *API keys* → **service_role**. Put them in
   GitHub → repository Settings → Secrets and variables → Actions as secrets
   `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, plus a
   variable `APP_URL` = the Vercel production URL. Then GitHub → Actions →
   *Setup — apply schema, create owner* → *Run workflow*. Re-run it any time to
   apply new migrations; it skips what is already applied.

3. **Pick one address and tell Kinus.** A Vercel project answers on several
   addresses (for example `kinus.vercel.app` and `kinus-<team>.vercel.app`), and
   sign-ins are stored per address. In Vercel → Settings → Environment Variables
   add `APP_URL` = `https://kinus.vercel.app` (Production) and redeploy. Kinus then
   forwards every other production address to that one, and emailed links use it.
   `/health` shows which address is set.
   **Auth settings** (Supabase → Authentication → URL Configuration):
   - Site URL = that same address
   - Redirect URLs: add `https://kinus.vercel.app/**`. The Supabase–Vercel
     integration manages this list too and adds Vercel's own project address;
     that is fine, because Kinus forwards it.
   Under Authentication → Sign In / Providers → Email keep the provider on and
   turn *Allow new users to sign up* **off** (staff are invited, never self-register).

4. **Create the first owner.** Two ways:
   - With the Setup workflow (B above): run it with your email and name; you get
     the invitation email.
   - In the dashboard: SQL Editor → run
     ```sql
     insert into settings (key, value) values ('bootstrap_owner', '{"email": "you@example.com"}')
     on conflict (key) do update set value = excluded.value;
     ```
     then Authentication → Users → **Invite user** with the same email. The
     profile trigger makes that account the owner. Open the email, set a
     password, and you are in.

5. Invite everyone else from **Staff → Invite** inside the app.

Supabase extensions `unaccent` and `pg_trgm` are enabled by the migration.
Storage buckets `imports`, `templates`, `print-output` are created by it as well.

Later, for a staging copy: create a second Supabase project, add its connection
string as the `SUPABASE_DB_URL` secret on a GitHub environment named `staging`,
and run *DB → staging*.

Backups: Supabase daily backups (Pro plan) plus a nightly `pg_dump` GitHub Action
to a private artifact during the program week.

Migrations: `supabase/migrations/*.sql`, applied either by Supabase's GitHub
integration or by the workflows below with `supabase db push --db-url`. Both record
what they applied in `supabase_migrations.schema_migrations`, so they can coexist
and re-runs only apply new files.

Generated TypeScript types (`lib/supabase/database.types.ts`) are committed;
regenerate after a schema change with
`supabase gen types typescript --db-url <url> --schema public > lib/supabase/database.types.ts`.

Auth email templates: the defaults work. Invitations and sign-in links carry the
session in the link itself (Supabase's implicit flow), so they work when opened on
a phone or a different browser than the one that asked. They land on `/login`,
which completes the sign-in and continues to `/set-password` for invitations. Optionally point the templates at
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (resp.
`type=magiclink`) for a fully server-side flow.

## 9.3 GitHub

- Repo `gsheetsacct-arch/Kinus`. Current working branch:
  `claude/gracious-noether-nc1kf8` (no `main` yet). Vercel deploys whichever
  branch is set as its production branch.
- Workflows:
  - `ci.yml`: typecheck, lint, unit tests, build, and the SQL suite (schema +
    RLS + import) against a Postgres service — on every PR and push.
  - `setup.yml`: manual; applies migrations and invites the first owner.
  - `db-prod.yml`: `supabase db push --db-url` on every push to `main` that
    touches `supabase/migrations/`; also runnable manually. Not needed when the
    Supabase GitHub integration is on.
  - `db-staging.yml`: manual, for an optional staging project.
- Secrets live in repository secrets (or GitHub Environments `staging` /
  `production` for the DB workflows).

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
| `NEXT_PUBLIC_CAMP_TIMEZONE` | client+server | optional, default `America/New_York`: every time shown in the app is camp time |
| `APP_URL` | server | the one address staff use, e.g. `https://kinus.vercel.app`. Other production addresses redirect to it; emailed links use it. If unset, links use the address the sender is on. |

- **Function region = database region.** Every page talks to Supabase several
  times; if Vercel's functions run far from the database each trip adds ~70–150 ms.
  Vercel → Project → Settings → Functions → Function Region: pick the region of
  your Supabase project (Supabase → Project Settings → General shows it; e.g.
  `us-east-1` ↔ Vercel `iad1` Washington, D.C.).
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
