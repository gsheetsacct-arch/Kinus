# Kinus — camp operations system

Kinus is the operations system for a short camp program: the single place
staff use to check campers in and out, see who is where, print name and
luggage tags, and produce bunk / head-counselor /
division-head lists. The camper roster itself is **not** authored here: it is
imported from the registration export, which stays the source of truth and is
re-uploaded whenever it changes.

## Status

**Phases 0, 1 and 2 are built** (foundations, roster, people, lists, check-in/out,
live status, tags and printing). Phase 3 (hardening) is next; converting your
Publisher templates waits for the files. See [docs/10-roadmap.md](docs/10-roadmap.md).

What works today:

- Sign-in (password or emailed link), staff invites, roles and per-division/bunk access
- Sessions, divisions and bunks (created by import, editable)
- Roster import: upload → match columns → field-by-field review → apply → report,
  with conflict resolution, "not in export" flagging, encoding recovery, the
  lost-text guard, campers listed in several divisions placed where their bunk
  belongs, and **undo** of the latest import (back to the previous state)
- Imports belong to the active session; sessions can be renamed and deleted
- Your account page: change your name, phone and password; admins can email a
  sign-in link or set a password for anyone
- Setup checklist on the home page for new admins
- Camper search (Hebrew/French/English, accent- and niqqud-insensitive) and detail
  pages with contacts, timeline, change history and scoped editing
- Lists from presets (counselor / head counselor / division head / office / bus),
  grouped by bunk, printable, CSV export; preset editor; field-visibility matrix
- **Camps**: American, Hebrew and French run separately; a switcher at the top of the
  menu picks the camp (everyone starts in American). Divisions are placed in camps
  automatically by name
- **Check in** (`/scan`): Check in / Check out (coming back or going home) / Look up
  modes; USB/Bluetooth scanner, phone camera, or name/code search; full-screen
  colour flash and sound; 30-second undo; one-tap tag requests from the camper card
- **Who's here** (`/status`): live board by bunk or division with counts, who
  checked each camper in or out and when, tap-to-call parents; directors check in,
  send home or mark no-show many campers at once and correct a status with a reason
- **Print** (`/print`): queue for the office (print, PDF, mark printed, retry),
  batches for a camp/division/bunk (everyone, never printed, here now, arrived today),
  template editor with live preview and background images, merge fields with
  conversion tables (Youth Small → YS, Division 2 → 2), and a CSV of converted
  merge data for Publisher
- Fast with a full camp: ~1,000 campers load in well under a second

## Setting it up (no local tools needed)

Supabase, Vercel and GitHub are all configured in the browser. Migrations are
applied by Supabase's GitHub integration or by the **Setup** GitHub Actions
workflow; the first owner is invited from the Supabase dashboard or by that same
workflow. Step by step: [docs/09-deployment.md §9.2](docs/09-deployment.md#92-first-time-setup-entirely-in-the-browser-once).

## Developing locally (optional)

```bash
cp .env.example .env.local        # fill in the Supabase keys
npm install
npm run dev                       # http://localhost:3000
npm test                          # import engine unit tests
npm run typecheck && npm run lint
supabase/tests/run.sh postgresql://postgres:postgres@localhost:5432   # schema + RLS + import tests
```

## Documents

| # | Document | What it covers |
|---|----------|----------------|
| 1 | [Architecture](docs/01-architecture.md) | Stack, system diagram, layers, cross-cutting concerns, decisions |
| 2 | [Data model](docs/02-data-model.md) | Entities, keys, status machine, the draft schema |
| 3 | [Roles & permissions](docs/03-permissions.md) | Global roles, division/bunk scopes, access levels, field visibility, RLS |
| 4 | [Roster import](docs/04-import-and-sync.md) | Upload → map → diff → apply, matching rules, change breakdown |
| 5 | [Check-in / check-out](docs/05-checkin-checkout.md) | Attendance events, one-scan Check in / Check out / Lookup modes, fallbacks, status board |
| 6 | [Mail merges & printing](docs/06-printing-and-tags.md) | Merge fields and value conversions, Publisher templates, barcodes, one-tap print requests, office email |
| 7 | [Buzzer / pager](docs/07-buzzer-integration.md) | **On hold.** Assignment, paging, local bridge integration, manual fallback |
| 8 | [UI/UX plan](docs/08-ux-plan.md) | Personas, navigation, screen-by-screen flows, states, RTL, feedback |
| 9 | [Deployment](docs/09-deployment.md) | Supabase, GitHub, Vercel, Resend setup, environments, CI, secrets |
| 10 | [Roadmap & open questions](docs/10-roadmap.md) | Build phases and the questions that need answers from you |

Schema: [`supabase/migrations/`](supabase/migrations/) (validated by `supabase/tests/run.sh` on every CI run)

## Stack (summary)

- **Next.js** (App Router, TypeScript) hosted on **Vercel**
- **Supabase**: Postgres (+ Row Level Security), Auth, Storage, Realtime
- **Resend** for transactional email (print requests to the office, staff invites)
- Tailwind CSS + shadcn/ui, `bwip-js` for barcodes, SheetJS for spreadsheet parsing,
  headless Chromium for PDF rendering of tags
