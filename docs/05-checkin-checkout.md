# 5. Check-in, check-out and status

## 5.1 One screen, context-aware action

There is a single **Scan** screen rather than separate check-in and check-out pages.
Scanning (or searching) a camper shows a **camper card** whose primary button
depends on the camper's current status:

| Current status | Primary button | Secondary buttons |
|---|---|---|
| `expected` | **Check in** | — |
| `present` | **Check out** (asks: temporary or pickup?) | Request tag · Call parent · Note |
| `out` | **Check back in** | Picked up (final) |
| `departed` | **Check in again** (confirm) | — |
| `no_show` | **Check in** (confirm) | — |

The screen has a **mode** selector at the top that tunes the fast path for the
moment of the day:

- **Arrival** (buses/drop-off): a scan of an `expected` camper checks them in
  *immediately* with a big green flash, a beep/vibration, and a 6-second **Undo**
  toast. No tap needed. Anyone not `expected` shows the card instead of auto-acting.
- **Day** (default): every scan shows the card; nothing happens until a tap.
- **Pickup** (end of program): a scan shows the card with buzzer number large and
  the primary button **Picked up**; a second scan of the same camper within 10 s
  confirms pickup (two-scan confirm, so one accidental read never departs a kid).

Mode is per device (remembered in local storage); an admin can set the default mode
for everyone in Settings ("today is arrival day").

## 5.2 Input methods, in priority order

1. **Camera scan** (phone): `@zxing/browser` reads Code 128 and QR. The viewfinder
   is the top half of the screen in Arrival mode. Torch toggle for dim rooms.
2. **Hardware scanner** (USB/Bluetooth keyboard wedge on a laptop/tablet): a global
   key listener collects a fast burst (< 50 ms between keys) ending in Enter and
   routes it to the same handler. Works even when the search box is not focused.
3. **Search** (always visible): type name (any script), camper code, or a parent's
   phone number. Results are the scope-filtered `search_campers()` RPC, debounced
   250 ms, showing name · division · bunk · status chip. Tap → card.
4. **Browse** (fallback for "I can't spell it"): Division → Bunk → list of names
   with status chips; tap → card. Two taps for a counselor (their bunk is pre-selected).

Payload handling: `KN` + code → camper; `BZ` + number → buzzer (only meaningful on
the buzzer screens; elsewhere shows "that's a buzzer label"); anything else →
"Unknown barcode" with the raw text, and the search box pre-filled with it.

## 5.3 The camper card

```
┌──────────────────────────────────────────┐
│ ●  מנחם מענדל כהן                 100016  │  ← status dot, name (dir=auto), code
│    Hebrew · Bunk א · Grade 4             │
│    ⚑ medical flag                        │  ← only if any flag; details per visibility
│                                          │
│  PRESENT since 9:12 · by Shmuli L.       │  ← last event
│  Buzzer 17                               │  ← if assigned
│                                          │
│  [        CHECK OUT          ]           │  ← primary, 64px tall
│  [ Request tag ] [ Call parent ▾ ]       │
│  [ Note ]        [ Details → ]           │
└──────────────────────────────────────────┘
```

- **Call parent** opens a sheet listing contacts (mother, father, emergency) with
  `tel:` links and a copy button; `sms:` link as a long-press alternative. Shown
  only if the user may see contacts.
- **Check out** opens a sheet: *Temporary (coming back)* / *Picked up (final)*, an
  optional reason chip row (Parent · Doctor · Other) and a note. Final pickup in
  non-Pickup mode asks "Who picked up?" as free text (optional).
- **Request tag** → doc 6; one tap sends the default (name tag) to the office; a
  long-press/caret chooses luggage tag or both and lets the user override the
  destination email once.
- **Details** → full camper page (contacts, medical per visibility, timeline,
  history of import changes, bunk move, staff notes).

## 5.4 Writing an event

Client → server action `recordAttendance({camperId, eventType, method, note})` →
RPC `record_attendance()`. The RPC validates the transition (doc 2.3), inserts the
event, updates the camper, releases the buzzer on final pickup, and returns the event.
The client:
- optimistically updates the card (status, "by you, just now");
- on error (invalid transition because someone else already acted, or no permission)
  rolls back and shows the actual current status: "Already checked in by Rivky at
  9:10".

**Undo**: the toast's Undo calls `record_attendance(camper, 'correction', force_status
= previous)` with note "undo" — but only directors/admins may correct, so for
everyone else the *server action* performs the undo under the service role within
the 6-second window, verifying the last event is the user's own and younger than
the window. Result: a normal user can undo *their own* last scan immediately,
never anything older.

**Duplicate scans**: the same camper scanned twice in Arrival mode within 10 s is
ignored with a soft "already checked in" flash (no second event).

## 5.5 Bulk actions (directors/admins, Status screen)

- Mark all remaining `expected` as `no_show` (end of program).
- Mark a whole bunk as `present` (bus arrived, roll call done on paper) — creates
  one `arrival` event per camper with `method = 'bulk'`.
- Both require a confirmation with the count.

## 5.6 Status board

Route: `/status`. Scope-filtered automatically (counselor → their bunk; head
counselor / division head → their division; global roles → everything with a
division filter).

Top: count tiles **Expected · Present · Out · Departed · No-show** (tappable
filters). Then a list, grouped by bunk (or by division for wide scopes):

| Name | Bunk | Status | Since | By | Buzzer | Parent |
|---|---|---|---|---|---|---|
| Léa Gérard | F-2 | ● Present | 9:14 | Shmuli L. | 17 | 📞 |

- Status chip + time + who; tap row → camper card (same component as Scan).
- Parent icon opens the contacts sheet (`tel:` links).
- Search box and division/bunk filters; "only out" and "not yet arrived" quick filters.
- Live: Realtime subscription on `attendance_events` (insert) and `campers`
  (update) for the user's scope; rows animate on change; a 60 s background refetch.
- Export: CSV / print view of the current filter (office, directors).

## 5.7 Camper detail page

Tabs: **Overview** (card + contacts + bunk + flags) · **Timeline** (attendance events,
buzzer assignments, print jobs, each with actor and time) · **History** (field changes
from imports and edits, from `camper_history()`) · **Edit** (if `edit` level).

## 5.8 Failure modes

| Situation | Behaviour |
|---|---|
| No network | Card still renders from the cached roster; the action button shows "Pending…" and retries; after 30 s a persistent banner says what is queued. |
| Barcode damaged | Search by name / code; browse by bunk. |
| Camper not in system (walk-up) | "Not found" with **Add walk-in** (directors/admins): creates a camper with `source = manual`, flagged on the next import if still absent. |
| Wrong camper checked in | Undo within 6 s; otherwise a director corrects from the timeline (note required). |
| Two staff act at once | Second write fails validation; UI shows the real state. |
