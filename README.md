# Kinus — camp operations system

Kinus is the operations system for a short camp program: the single place
staff use to check campers in and out, see who is where, print name and
luggage tags, and produce bunk / head-counselor /
division-head lists. The camper roster itself is **not** authored here: it is
imported from the registration export, which stays the source of truth and is
re-uploaded whenever it changes.

## Status

**Phases 0 and 1 are built** (foundations, roster, people, lists). Phase 2
(check-in/out, status board, tags and printing) is next. See
[docs/10-roadmap.md](docs/10-roadmap.md).

What works today:

- Sign-in (password or emailed link), staff invites, roles and per-division/bunk access
- Sessions, divisions and bunks (created by import, editable)
- Roster import: upload → map columns → field-by-field diff preview → apply → report,
  with conflict resolution, "not in export" flagging, encoding recovery and the
  lost-text guard
- Camper search (Hebrew/French/English, accent- and niqqud-insensitive) and detail
  pages with contacts, timeline, change history and scoped editing
- Lists from presets (counselor / head counselor / division head / office / bus),
  grouped by bunk, printable, CSV export; preset editor; field-visibility matrix

## Running it

```bash
cp .env.example .env.local        # fill in the Supabase keys
npm install
npm run dev                       # http://localhost:3000
npm test                          # import engine unit tests
npm run typecheck && npm run lint
supabase/tests/run.sh postgresql://postgres:postgres@localhost:5432   # schema + RLS + import tests
```

First-time setup is in [docs/09-deployment.md](docs/09-deployment.md#92-supabase-setup-once).

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
