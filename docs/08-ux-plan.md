# 8. UI/UX plan

## 8.1 Principles

1. **The scan screen is the product.** Everything is measured by how fast a
   counselor at a bus door can check in a kid: target under 2 seconds, one scan,
   zero taps in Arrival mode.
2. **Phone first, thumb first.** Primary actions at the bottom, 56–64 px tall,
   full width. Nothing important hides behind hover or a tiny icon.
3. **Status is colour *and* words.** Green/amber/blue/grey dots always come with the
   word (Present / Out / Departed / Expected) for colour-blind staff and bright sun.
4. **Names in their own script, UI in English.** Per-field `dir="auto"`; never flip
   the whole layout. Hebrew and French sort naturally within their divisions.
5. **No training needed.** Role-based navigation shows a counselor three things;
   an admin sees everything. Empty states explain what to do next.
6. **Loud feedback, quiet errors.** Beep + vibration + full-screen flash on a
   successful scan; errors are explicit sentences ("Already checked in by Rivky at
   9:10"), never codes.
7. **Undo over confirm.** Fast actions are reversible for 6 seconds instead of
   asking "Are you sure?". Only irreversible or bulk actions confirm.

## 8.2 Personas and devices

| Persona | Device | Context | Needs |
|---|---|---|---|
| Counselor | Own phone, one hand, outdoors | Bus arrival, day, pickup | Scan/search their bunk, see who's in, call a parent, request a tag |
| Head counselor / division head | Phone or tablet | Moving around | Everything for their division, bunk lists, move a camper, see medical details |
| Logistics | Phone + USB scanner on a laptop at the desk | Arrival desk, pickup desk | Fast scanning, buzzer handout, lookup, paging |
| Office | Laptop + printer | Office | Print queue, batch tags, lists |
| Director | Tablet/laptop | Everywhere | Board for everything, corrections, bulk actions, reports |
| Owner/admin | Laptop | Before and during | Import, users, templates, settings |

## 8.3 Navigation

Mobile: bottom tab bar, max 4 tabs, chosen by role.

| Role | Tabs |
|---|---|
| counselor / scanner | **Scan** · **My bunk** (status) · **Buzzers** · More (lists, profile) |
| head counselor / division head | **Scan** · **Status** · **Lists** · More (buzzers, print, campers) |
| logistics | **Scan** · **Status** · **Buzzers** · More |
| office | **Print queue** · **Status** · **Lists** · More |
| director / admin / owner | **Scan** · **Status** · **Lists** · More (print, buzzers, imports, users, settings) |

Desktop (≥ 1024 px): left sidebar with the same items plus admin section; the
content area uses tables instead of cards.

Global: a search icon on every screen opens the camper search (same component as
Scan's search). A session/division switcher appears only for people with more than
one scope.

## 8.4 Screen inventory

### S1 Login
Email + password, "email me a link" alternative. Invite link lands on "Set your
password". Error copy is specific (wrong password vs. deactivated account).

### S2 Scan (home for most roles)
Described in doc 5. Layout, portrait phone:

```
┌────────────────────────────┐
│ Arrival ▾     🔦   Shmuli ▾│  mode, torch, account
├────────────────────────────┤
│                            │
│      [ camera viewfinder ] │  hidden when a hardware scanner is detected
│                            │
├────────────────────────────┤
│ 🔍 Name, code or phone     │
├────────────────────────────┤
│ Last: ● מנחם כהן  9:12 ✔   │  last 3 scans, tap to reopen card / undo
│       ● Léa Gérard 9:11 ✔  │
└────────────────────────────┘
```
After a scan the camper card slides up as a bottom sheet (doc 5.3). In Arrival
mode a full-screen green flash with the name replaces the sheet for 1.5 s.

States: camera permission denied (shows how to enable, search still works);
no network (banner, cached roster); unknown barcode; not in your scope ("This camper
is in French · Bunk 3 — ask their counselor"; directors can still act).

### S3 Status board
Doc 5.6. Phone: count tiles → grouped list with chips. Tablet/desktop: table with
sortable columns, sticky header, group headers per bunk with per-bunk counts.
Filters as chips: status, division, bunk, "out only", "not arrived", "has buzzer".

### S4 Camper detail
Doc 5.7. Header = camper card. Tabs: Overview · Timeline · History · Edit.
Medical section is visually distinct (amber border) and only present if visible to
this user; otherwise a single line "Medical flag — ask the head counselor".

### S5 Lists
Pick preset (filtered to the user's role) → pick scope (bunk/division/all as
allowed) → table, grouped. Buttons: Print (print CSS, one bunk per page, landscape
for wide presets), CSV, Share link (signed, 24 h, read-only, for a counselor
without an account — optional, off by default). Presets editor (admin): name,
audience, column picker from the field catalog (sensitive fields show a lock and
are only offered to audiences allowed to see them), sort, group-by, filters.

Default presets to ship:
- **Counselor bunk list**: name, grade, t-shirt, medical flag, mother phone, father phone.
- **Head counselor division list**: + bunk, allergies, EpiPen, medications, emergency contact 1.
- **Division head list**: + local address, cross streets, parent notes, medical notes, emergency contact 2.
- **Office roster**: name, code, division, bunk, status, tag printed?.
- **Bus list**: name, bunk, status (print-friendly checkboxes).

### S6 Print queue (office)
Doc 6.5. Realtime table: time, requested by, kind, campers (count or names), status,
Open PDF, Mark printed, Re-send (with "to" override). Filters: today, unprinted,
failed. Batch tab (doc 6.6). Templates tab (admin).

### S7 Buzzers
Doc 7.3: Handout and Lookup/Page. The number is set in 96 px type.

### S8 Admin → Imports
List of imports (date, who, file, summary chips, status). **New import** wizard:
Upload → Map columns → Preview → Apply → Report. Preview layout:

```
Added 12 · Changed 37 · Unchanged 402 · Conflicts 1 · Not in export 3
New divisions: — · New bunks: Hebrew/ד
[ Take bunks from file ☐ ]                                   [Cancel] [Apply import]
┌ Changed (37) ─────────────────────────────────────────────┐
│ ▸ Léa Gérard (100024)   bunk 1 → 2 · father.phone changed  │
│   ▾ field        current            from file              │
│     bunk         1                  2                      │
│     father.phone +1 718 555 0100    +1 718 555 0199        │
└────────────────────────────────────────────────────────────┘
```

### S9 Admin → Users & scopes
Table of staff with role, scopes as chips ("French · all bunks · head counselor ·
scan"), active toggle, last sign-in. User page: profile, global role, scope rows
(division, bunk-or-all, scope role, level) with add/remove, "Resend invite",
"Sign out everywhere", "Deactivate".

### S10 Admin → Divisions & bunks
Drag-order divisions, set language and colour, rename; bunks under each; merge
bunk (moves campers). Counts of campers per bunk.

### S11 Admin → Settings
Office email (to/cc), pager mode + bridge status, scan defaults (auto-confirm,
undo seconds, sound), "today" mode, field visibility matrix (checkbox grid
group × role), active session, import warning threshold.

### S12 Health
DB, realtime, bridge, last cron runs, queue depths, failed jobs with retry.

## 8.5 Component system

- **Design tokens**: spacing 4-pt grid; type scale 14/16/20/28/40/96 (the last for
  buzzer numbers); radius 12; touch targets ≥ 48 px, primary ≥ 56 px.
- **Status chip**: dot + label; colours: expected `gray-400`, present `green-600`,
  out `amber-500`, departed `blue-600`, no-show `red-600` outline. Same component
  everywhere (board, card, lists, search results).
- **Camper card**: one component used by Scan, Status, Buzzers and Detail so the
  action logic lives in one place.
- **Contacts sheet**: role label, name, `tel:` link, copy, `sms:` on long press.
- **Confirm sheet**: used only for pickup outside Pickup mode, bulk actions,
  corrections, import apply, deactivate user.
- **Toast with Undo**: 6 s, pausable by touch, announces to screen readers.
- Dark mode follows the system (useful at night pickups); print styles are always
  light.

## 8.6 Internationalisation and RTL

- UI strings in English only for v1, but all strings go through a messages file so
  Hebrew/French UI can be added without a refactor.
- Data fields render with `dir="auto"` and `unicode-bidi: plaintext`; mixed lines
  (Hebrew name + Latin bunk) are composed from separate spans so punctuation does
  not jump.
- Sorting: Postgres ICU collation `und-x-icu`; within a division the language is
  known, so lists can sort with `he-x-icu` / `fr-x-icu` when all names share a
  script.
- Search normalisation per doc 2.4. The search box shows a hint: "Hebrew, French
  or English — accents don't matter".
- Fonts: Noto Sans + Noto Sans Hebrew, loaded locally (no Google Fonts call at a
  camp with poor Wi-Fi).

## 8.7 Accessibility and physical conditions

- Contrast ≥ 4.5:1 for all text; the success flash uses both colour and a large
  check icon + name.
- Scan sounds distinct for success (one short beep), already-done (two short), and
  error (low buzz); vibration pattern matches. Toggle in Settings and per device.
- Everything keyboard-operable (hardware scanner users on laptops press Enter to
  confirm the primary action after a scan).
- Reduced motion respected (no slide animations).

## 8.8 Performance and offline

- Scan page is a PWA route with the user's roster (ids, names, codes, bunk, status)
  cached in IndexedDB and refreshed on focus; a barcode → camper lookup never waits
  on the network.
- Writes go through server actions with optimistic UI; failed writes queue with a
  visible counter and retry with backoff.
- Status board uses Realtime; lists are server-rendered tables (fast on cheap
  phones), paginated above 300 rows.
- Images: only template backgrounds; no camper photos in v1 (see roadmap).

## 8.9 Key flows (step counts)

| Flow | Steps (counselor on phone) |
|---|---|
| Check in a camper on arrival day | Open app (already on Scan, Arrival mode) → point camera → done (auto) |
| Check out a camper mid-day | Scan → tap Check out → tap Temporary → done |
| Child comes back | Scan → tap Check back in → done |
| Find a kid whose tag is lost | Type 3 letters → tap result → act |
| Request a replacement name tag | Scan/search → tap Request tag → done (office emailed) |
| Call a parent | Scan/search → Call parent → tap number |
| Hand out a buzzer (logistics) | Scan kid → scan buzzer label → done |
| Parent arrives (pickup desk) | Type name → read big number → Page / dial → scan kid → Picked up |
| See who is still missing from the bunk | Status tab → "Not arrived" chip |
| Upload a new export (admin) | Imports → New → drop file → (mapping pre-filled) → Preview → Apply |
