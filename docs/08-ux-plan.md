# 8. UI/UX plan

## 8.1 Principles

1. **The scan screen is the product.** Everything is measured by how fast a
   counselor at a bus door can check in a kid: target under 2 seconds, one scan,
   zero taps, in both Check in and Check out modes.
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
| Logistics | Phone + USB scanner on a laptop at the desk | Arrival desk, pickup desk | Fast scanning in both directions, lookup, print requests |
| Office | Laptop + printer | Office | Print queue, batch tags, lists |
| Director | Tablet/laptop | Everywhere | Board for everything, corrections, bulk actions, reports |
| Owner/admin | Laptop | Before and during | Import, users, templates, settings |

## 8.3 Navigation

Mobile: bottom tab bar, max 4 tabs, chosen by role.

| Role | Tabs |
|---|---|
| counselor / scanner | **Scan** · **My bunk** (status) · **Lists** · More (profile) |
| head counselor / division head | **Scan** · **Status** · **Lists** · More (print, campers) |
| logistics | **Scan** · **Status** · **Print queue** · More |
| office | **Print queue** · **Status** · **Lists** · More |
| director / admin / owner | **Scan** · **Status** · **Lists** · More (print, imports, users, settings) |

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
│ [ Check in | Check out | Lookup ]   ← big segmented control, thumb-reachable
│   ○ Coming back  ● Going home       ← only in Check out mode
├────────────────────────────┤
│                            │
│      [ camera viewfinder ] │  hidden when a hardware scanner is detected
│                            │
├────────────────────────────┤
│ 🔍 Name, code or phone     │  same action as a scan in this mode
├────────────────────────────┤
│ Last: ● מנחם כהן  9:12 IN  │  last 3 scans; tap → card / Undo
│       ● Léa Gérard 9:11 IN │
└────────────────────────────┘
```
Every mode is one scan. In Check in / Check out the screen flashes full-screen
(green for in, blue for out) with the name and the action in words, beeps, and
offers Undo for 6 s. In Lookup the camper card slides up as a bottom sheet
(doc 5.3) with the action buttons and the print row.

States: camera permission denied (shows how to enable, search still works);
no network (banner, cached roster); unknown barcode; not in your scope ("This camper
is in French Division · Bunk 3 — ask their counselor"; directors can still act);
already in that state (soft flash, nothing recorded).

### S3 Status board
Doc 5.6. Phone: count tiles → grouped list with chips. Tablet/desktop: table with
sortable columns, sticky header, group headers per bunk with per-bunk counts.
Filters as chips: status, division, bunk, "out only", "not arrived", "going home today".

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

### S6 Print (office / admin)
Doc 6. Tabs: **Queue** (realtime: time, requested by, template, campers, status,
Open PDF, Mark printed, Re-send with "to" override; filters today / unprinted /
failed) · **Batch** (template, scope, copies, sheet layout; Publisher data-source
export) · **Templates** (admin: list, flags *show on card* / *auto on first
check-in*, order, editor with live preview) · **Merge fields** (admin: the field
list and the value-map editor seeded with every distinct value in the roster, so
"Youth Small → YS" is a matter of filling in a column).

### S7 Buzzers (on hold)
Doc 7. Not part of the initial build; the pickup flow is Check out mode with
"Going home".

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
Office email (to/cc), scan defaults (default mode, undo seconds,
undo seconds, sound), "today" mode, field visibility matrix (checkbox grid
group × role), active session, import warning threshold.

### S12 Health
DB, realtime, last cron runs, queue depths, failed jobs with retry.

## 8.5 Component system

- **Design tokens**: spacing 4-pt grid; type scale 14/16/20/28/40; radius 12;
  touch targets ≥ 48 px, primary ≥ 56 px; the mode control ≥ 56 px tall.
- **Status chip**: dot + label; colours: expected `gray-400`, present `green-600`,
  out `amber-500`, departed `blue-600`, no-show `red-600` outline. Same component
  everywhere (board, card, lists, search results).
- **Camper card**: one component used by Scan (Lookup), Status and Detail so the
  action logic and the print row live in one place.
- **Mode control**: segmented Check in / Check out / Lookup with a mode tint on the
  whole screen; Check out shows the Coming back / Going home toggle beneath it.
- **Contacts sheet**: role label, name, `tel:` link, copy, `sms:` on long press.
- **Confirm sheet**: used only for bulk actions, corrections, import apply,
  deactivate user. Scans never confirm; they undo.
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
| Check in a camper on arrival | App opens on Scan in Check in mode → point camera → done (auto, Undo 6 s) |
| Check out a camper mid-day | Switch to Check out (Coming back) → scan → done |
| Child comes back | Switch to Check in → scan → done (recorded as a return) |
| Parent picks up at the end | Check out mode with Going home (default on pickup day) → scan → done |
| Find a kid whose tag is lost | Type 3 letters → tap result → the mode's action happens, or the card opens in Lookup |
| Request a replacement name tag or any merge | Lookup → scan/search → tap the template button → done (office emailed) |
| Call a parent | Lookup → scan/search → Call parent → tap number |
| See who is still missing from the bunk | Status tab → "Not arrived" chip |
| Upload a new export (admin) | Imports → New → drop file → (mapping pre-filled) → Preview → Apply |
| Map a new t-shirt size for tags (admin) | Print → Merge fields → TSHIRT value map → fill the blank output cell |
