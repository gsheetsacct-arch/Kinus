# Kinus — camp operations system

Kinus is the operations system for a short camp program: the single place
staff use to check campers in and out, see who is where, print name and
luggage tags, and produce bunk / head-counselor /
division-head lists. The camper roster itself is **not** authored here: it is
imported from the registration export, which stays the source of truth and is
re-uploaded whenever it changes.

## Status

Planning. This repository currently holds the architecture and UI/UX plan and
a draft database schema. No application code yet.

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

Draft schema: [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)

## Stack (summary)

- **Next.js** (App Router, TypeScript) hosted on **Vercel**
- **Supabase**: Postgres (+ Row Level Security), Auth, Storage, Realtime
- **Resend** for transactional email (print requests to the office, staff invites)
- Tailwind CSS + shadcn/ui, `bwip-js` for barcodes, SheetJS for spreadsheet parsing,
  headless Chromium for PDF rendering of tags
