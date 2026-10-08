# 1. Architecture

## 1.1 Goals and constraints

- **One source of truth outside the system.** The registration export is re-uploaded
  whenever acceptances change. Kinus must absorb a full re-upload without losing
  anything it owns (attendance, buzzer assignments, print jobs, notes) and must show
  exactly what changed.
- **Fast on a phone, in a noisy parking lot.** Check-in is the hot path: one scan,
  one tap, done. Everything else is secondary to that.
- **Multilingual data, English UI.** Names are Hebrew, French, or English. Hebrew is
  RTL. Search, sorting, printing, and display must all handle this correctly.
- **Small scale, high stakes.** Hundreds of campers, tens of staff, a few days of
  operation. Simplicity and reliability beat scalability features.
- **Scoped access.** A counselor sees their bunk. A head counselor or division head
  sees their division. Owners, directors, and logistics see everything. The scope
  and the level of access (view / scan / edit / admin) are assignable per person.
- **Prescribed platform.** Supabase + GitHub → Vercel + Resend.

## 1.2 System diagram

```
                ┌──────────────────────────────────────────────────────┐
                │                    Browsers / phones                 │
                │   Counselor (phone)   Office (laptop)   Admin (any)   │
                │   camera scan / USB   print queue       import, cfg   │
                └────────────┬─────────────────────────────┬───────────┘
                             │ HTTPS                       │
                ┌────────────▼─────────────────────────────▼───────────┐
                │              Vercel  —  Next.js (App Router)         │
                │  React UI (PWA)   Server Actions   Route Handlers     │
                │  - scan / status  - import pipeline - /api/print/*    │
                │  - lists          - attendance RPC  - /api/pager/*    │
                │  - admin          - print jobs      - cron workers    │
                │                   PDF renderer (headless Chromium)    │
                └───────┬───────────────────┬───────────────┬──────────┘
                        │ supabase-js       │ supabase-js   │ Resend API
                        │ (user JWT, RLS)   │ (service role,│
                        │                   │  server only) │
                ┌───────▼───────────────────▼────────┐  ┌───▼─────────┐
                │             Supabase               │  │   Resend    │
                │  Postgres + RLS + pg functions     │  │ email to    │
                │  Auth (email / magic link)         │  │ office,     │
                │  Storage (exports, templates, PDFs)│  │ invites     │
                │  Realtime (status board updates)   │  └─────────────┘
                └───────────────────┬────────────────┘
                                    │ realtime subscription (queue table)
                          ┌─────────▼──────────┐
                          │  On-site pager     │   ON HOLD, see doc 7
                          │  bridge (laptop /  │──► pager transmitter
                          │  Raspberry Pi)     │   (serial / USB / LAN)
                          └────────────────────┘
```

## 1.3 Stack and rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Web app | Next.js 15, App Router, TypeScript | One codebase for UI and server logic; Vercel-native; server actions keep secrets off the client. |
| UI | Tailwind CSS + shadcn/ui + Radix | Fast to build, accessible by default, easy large-touch-target styling, good RTL support via logical CSS properties. |
| Database | Supabase Postgres | Relational data with real constraints; Row Level Security enforces scopes at the data layer, not just in the UI. |
| Auth | Supabase Auth (email + password, magic link, invite) | No separate identity service. Roles live in a `profiles` table joined to `auth.users`. |
| Files | Supabase Storage | Uploaded exports, template background images, generated PDFs. Private buckets, signed URLs. |
| Realtime | Supabase Realtime (`postgres_changes`) | Live status board and print queue without polling. Respects RLS. |
| Search | Postgres `pg_trgm` + `unaccent` | Fuzzy, accent-insensitive name search across Hebrew/French/English without an external search service. |
| Spreadsheet parsing | SheetJS (`xlsx`) | Reads `.xlsx`, `.xls`, `.csv` with proper Unicode. Runs server-side. |
| Barcodes | `bwip-js` | Generates Code 128 / QR as SVG or PNG server-side; no fonts needed. |
| PDF rendering | `puppeteer-core` + `@sparticuz/chromium` in a Node route handler | Only engine that renders Hebrew bidi text, custom fonts, and an image background faithfully. Templates are plain HTML/CSS, so the same template previews in the browser. |
| Email | Resend + React Email | Print requests (with PDF attachment) to the office, staff invites, optional daily summary. |
| Camera scanning | `@zxing/browser` (fallback `html5-qrcode`) | Reads Code 128 and QR from the phone camera. USB/Bluetooth scanners work with no library (keyboard wedge). |
| Validation | `zod` | Shared schemas for forms, server actions, and import rows. |
| Testing | Vitest (unit: diff engine, status machine, mapping), Playwright (check-in flow) | The diff engine and status transitions are where bugs would hurt most. |
| Migrations | Supabase CLI, SQL files in `supabase/migrations` | Schema is versioned with the code and applied by CI. |

## 1.4 Application layers

### Client (browser / PWA)
- Installable PWA so staff get a home-screen icon and full-screen scan page.
- Reads data through server components and server actions. The anon Supabase key is
  used in the browser **only** for Realtime subscriptions and auth session handling.
- A global keyboard-wedge listener on scan pages catches barcode input from USB and
  Bluetooth scanners (fast burst of characters ending with Enter).

### Server (Next.js on Vercel)
- **Server actions** for all writes: record attendance, request print, assign buzzer,
  edit camper, apply import. Each action creates a Supabase client bound to the
  caller's JWT so RLS applies, then calls a Postgres function where a transaction or
  validation is needed.
- **Route handlers** for things that are not form submissions: PDF generation,
  barcode images, the pager bridge endpoints, CSV export, cron.
- **Service-role client** is used only where the user's rights are insufficient by
  design: writing the audit log, emailing, moving files between buckets. Never
  exposed to the browser.

### Database (Supabase Postgres)
- Tables, enums, constraints, RLS policies: [doc 2](02-data-model.md), [doc 3](03-permissions.md).
- Postgres functions (`security definer`, with explicit permission checks) for the
  operations that must be atomic: `record_attendance`, `apply_import`,
  `assign_buzzer`, `release_buzzer`, `search_campers`.
- Triggers maintain denormalized state (`campers.status`, `campers.last_event_id`,
  `campers.name_normalized`) and the audit log.

### Background work
There is no long-running worker. Three mechanisms cover it:
1. **Request-time work** for anything under ~10 s (single-tag PDF, a diff preview).
2. **Queue tables + Vercel Cron** for batch work: `print_jobs` rows with
   `status = 'queued'` are picked up by `/api/cron/print-jobs` every minute (and also
   kicked immediately by the action that created them). Batch tag generation for a
   whole division runs this way.
3. **Queue table + on-site bridge** for the pager: `page_requests` rows are consumed
   by a small Node script on the camp's network (doc 7, on hold).

## 1.5 Cross-cutting concerns

### Identity of a camper
Every camper gets a Kinus-owned, immutable `camper_code` on first import (6 digits,
last digit a check digit). It is what the barcode encodes and what staff type as a
fallback. It never changes, even if the export's own ID or the name changes. Matching
on re-import uses the export's ID column when there is one, otherwise a composite
key; see [doc 4](04-import-and-sync.md).

### Multilingual text
- All text columns are `text` in UTF-8; Postgres collation `und-x-icu` for ordering
  mixed scripts sensibly.
- `name_normalized` is a generated column: `unaccent(lower(first || ' ' || last))`
  with Hebrew niqqud (U+0591–U+05C7) stripped and final-form letters mapped to their
  regular forms, so "כהן" and "כהנ" match and "Léa" matches "lea".
- Display uses `dir="auto"` per field so a Hebrew name right-aligns inside an
  English UI without flipping the whole layout.
- Import accepts UTF-8, UTF-16 and legacy Windows-1255/1252 files and refuses
  files whose Hebrew/French was already destroyed by a re-save (doc 4).
- Fonts: bundle Noto Sans + Noto Sans Hebrew for the UI and for PDFs so rendering is
  identical everywhere.

### Audit trail
A single `audit_log` table records every insert/update/delete on the operational
tables (actor, table, row, before/after diff, source: `ui` | `import:<id>` |
`system`). The camper "history" tab and the import "what changed" breakdown are
both views over this table.

### Realtime
The status board subscribes to `attendance_events` inserts and `campers` updates
filtered by the user's scope (Realtime respects RLS). On an event the client patches
its local list; a periodic refetch every 60 s is the safety net.

### Offline tolerance
Phase 1: the scan page caches the roster for the user's scope in IndexedDB so lookup
and the camper card work without signal; writes are retried with a visible
"pending" badge. Phase 2 (if needed): full queued writes with conflict display.
See [doc 10](10-roadmap.md).

### Observability
Vercel logs + Supabase logs. Every server action logs `{action, user, camper,
duration, result}` as structured JSON. Sentry is optional and can be added later.

## 1.6 Repository layout (planned)

```
kinus/
├── app/                      # Next.js App Router
│   ├── (auth)/login
│   ├── (app)/
│   │   ├── scan/             # check-in / out / pickup
│   │   ├── status/           # live board
│   │   ├── campers/[id]/     # camper detail
│   │   ├── lists/            # bunk / HC / DH lists from presets
│   │   ├── print/            # queue (office), templates (admin)
│   │   ├── buzzers/          # handout, lookup, page (on hold)
│   │   └── admin/            # imports, users & scopes, divisions/bunks, settings
│   └── api/                  # route handlers: print render, cron, pager bridge, export
├── components/
├── lib/
│   ├── supabase/             # server/browser clients, generated types
│   ├── import/               # parser, mapping, matcher, diff engine
│   ├── attendance/           # status machine (pure functions)
│   ├── print/                # template model, HTML renderer, barcode
│   ├── pager/                # provider interface + implementations (on hold)
│   └── fields.ts             # field catalog (labels, sensitivity, list availability)
├── emails/                   # React Email templates
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
├── bridge/                   # on-site pager bridge (separate package, on hold)
└── docs/
```

## 1.7 Decisions (ADR summary)

| # | Decision | Alternatives considered | Reason |
|---|----------|-------------------------|--------|
| A1 | Server-rendered PDFs with headless Chromium | `@react-pdf/renderer`, `pdf-lib` | Only Chromium handles Hebrew bidi + arbitrary fonts + image backgrounds without hand-rolled text shaping. Browser print of the same HTML is the zero-dependency fallback. |
| A2 | Event-sourced attendance with a denormalized status column | Status column only | Need "who checked them in/out last" and a full timeline; a trigger keeps the fast-read column current. |
| A3 | Full re-import with diff preview, never delete | Incremental edits in the app | Matches how the roster is actually managed. Campers missing from a new export are flagged, not removed. |
| A4 | Scopes as rows (`user × division × bunk? × level`) | Role-only RBAC | One person can be head counselor of one division and a plain scanner elsewhere; rows express that directly and RLS can evaluate them. |
| A5 | Pager integration via a queue table and an on-site bridge (on hold) | Direct API call from Vercel | Pager transmitters sit on the camp LAN or a serial port; Vercel cannot reach them. The queue also doubles as the paging log. The manual lookup page is always available. |
| A6 | One Supabase project, `sessions` table to separate years | A project per year | Keeps staff accounts, templates, and presets across seasons; archiving a session is one flag. |
| A7 | Column-mapping presets for import | Hard-coded column names | The export format is not known yet and may change; a saved mapping makes future uploads one click. |
