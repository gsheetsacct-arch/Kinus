# 5. Check-in, check-out and status

## 5.1 One screen, three explicit modes, one scan each

There is a single **Scan** screen. At the top is a large segmented control with
three modes. **Every mode takes exactly one scan** and acts immediately; the
difference between modes is *what* the scan does, never *how many* scans it takes.

| Mode | A scan of a camper… | If the camper is already in that state |
|---|---|---|
| **Check in** | records an arrival (or a return if they were out) → green flash, beep, 6-second Undo | "Already in since 9:12 (Rivky)" — soft flash, nothing recorded |
| **Check out** | records a check-out → blue/amber flash, beep, 6-second Undo | "Already out since 13:40 (Shmuli)" — soft flash, nothing recorded |
| **Lookup** | opens the camper card; nothing is recorded until a button is tapped | — |

Check-out has a sticky sub-toggle, visible under the segmented control:
**Coming back** (temporary, status `out`) / **Going home** (final, status
`departed`). The default follows the "today" setting (normal day → Coming back;
pickup day → Going home) and the user can flip it at any time. The current choice
is always written on the flash so a mistake is obvious and undoable.

Mode is per device (remembered locally). Admins can set the default mode and the
day type for everyone in Settings. The segmented control is big enough to switch
with a thumb, and the whole screen is tinted faintly by mode (green / blue / neutral)
so nobody scans into the wrong one without noticing.

Manual entry works identically in every mode: typing a name or code and tapping a
result does the mode's action (Check in / Check out) or opens the card (Lookup).
Browsing by bunk does the same.

## 5.2 Input methods, in priority order

1. **Camera scan** (phone): `@zxing/browser` reads Code 128 and QR. The viewfinder
   is the top half of the screen in Check in / Check out modes. Torch toggle.
2. **Hardware scanner** (USB/Bluetooth keyboard wedge on a laptop/tablet): a global
   key listener collects a fast burst (< 50 ms between keys) ending in Enter and
   routes it to the same handler, even when no input is focused.
3. **Search** (always visible): name in any script, camper code, or a parent's
   phone number → scope-filtered `search_campers()` RPC, debounced 250 ms; results
   show name · division · bunk · status chip.
4. **Browse**: Division → Bunk → names with status chips. Two taps for a counselor
   (their bunk is pre-selected).

Payload handling: `KN` + code → camper; anything else → "Unknown barcode" with the
raw text, and the search box pre-filled with it.

## 5.3 The camper card

Opened by Lookup mode, by tapping a row on the status board, or by tapping the
"last scans" list after a check-in/out. It is the one place with buttons.

```
┌──────────────────────────────────────────┐
│ ●  מנחם מענדל כהן                 100016  │  status dot, name (dir=auto), code
│    Hebrew Division · Group 112 · Grade 4 │
│    ⚑ medical flag                        │  only if any flag; details per visibility
│                                          │
│  PRESENT since 9:12 · by Shmuli L.       │  last event
│                                          │
│  [ Check out ▾ ]      [ Check in ]       │  only the valid actions are enabled
│                                          │
│  Print:  [Name tag] [Luggage tag] [Bus]  │  one button per template (doc 6)
│                                          │
│  [ Call parent ▾ ]  [ Note ]  [Details →]│
└──────────────────────────────────────────┘
```

- **Print row**: one button per mail-merge template the admin marked
  *show on card*, in the admin's order. One tap generates that merge for this
  camper and emails it to the office (default address from Settings; long-press
  to change the destination for this request only). The button shows the result
  inline: "Sent 9:41" → "Printed 9:44" when the office marks it.
- **Call parent** opens a sheet listing contacts (mother, father, emergency 1/2)
  with `tel:` links and copy; `sms:` on long-press. Only if contacts are visible to
  this user.
- **Check out ▾** opens the Coming back / Going home choice plus an optional reason
  (Parent · Doctor · Other) and note. **Check in** records arrival or return.
- **Details** → full camper page (contacts, medical per visibility, timeline,
  import history, bunk move, staff notes).

## 5.4 Writing an event

Client → server action `recordAttendance({camperId, eventType, method, note})` →
RPC `record_attendance()`. The RPC validates the transition (doc 2.3), inserts the
event, updates the camper, and returns the event. The client:

- optimistically updates the flash/card (status, "by you, just now");
- on error (someone else already acted, or no permission) shows the actual state:
  "Already checked in by Rivky at 9:10".

**Undo**: the toast's Undo reverts the user's own last event if it is younger than
the undo window (default 6 s, Settings). It is performed by the server action under
the service role after verifying both conditions; it inserts a `correction` event
with note "undo" rather than deleting anything. Nobody can undo someone else's
action or anything older; directors use the Timeline's correction instead.

**Duplicate reads**: the same barcode read twice within 3 s is ignored (camera
scanners fire repeatedly while the tag is in view).

**Auto-print on first check-in**: templates marked *auto on first check-in* (e.g.
the name tag) are requested automatically the first time a camper is checked in
during the session, once. The flash says "Name tag sent to office".

## 5.5 Bulk actions (directors/admins, Status screen)

- Mark all remaining `expected` as `no_show` (end of program).
- Mark a whole bunk as `present` (roll call done on paper): one `arrival` event per
  camper with `method = 'bulk'`.
- Both confirm with the count.

## 5.6 Status board

Route: `/status`. Scope-filtered automatically (counselor → their bunk; head
counselor / division head → their division; global roles → everything with a
division filter).

Top: count tiles **Expected · Present · Out · Departed · No-show** (tappable
filters). Then a list, grouped by bunk (or by division for wide scopes):

| Name | Bunk | Status | Since | By | Parent |
|---|---|---|---|---|---|
| Léa Gérard | F-2 | ● Present | 9:14 | Shmuli L. | 📞 |

- Status chip + time + who; tap row → camper card.
- Parent icon opens the contacts sheet (`tel:` links).
- Search box and division/bunk filters; "only out" and "not yet arrived" quick filters.
- Live: Realtime subscription on `attendance_events` (insert) and `campers`
  (update) for the user's scope; rows animate on change; 60 s background refetch.
- Export: CSV / print view of the current filter (office, directors).

## 5.7 Camper detail page

Tabs: **Overview** (card + contacts + bunk + flags) · **Timeline** (attendance
events, print jobs, each with actor and time) · **History** (field changes from
imports and edits, from `camper_history()`) · **Edit** (if `edit` level).

## 5.8 Failure modes

| Situation | Behaviour |
|---|---|
| No network | Card still renders from the cached roster; the action shows "Pending…" and retries; after 30 s a banner says what is queued. |
| Barcode damaged or tag lost | Search by name / code; browse by bunk; print a new tag from the card. |
| Camper not in system (walk-up) | "Not found" with **Add walk-in** (directors/admins): creates a camper flagged `manual`, surfaced on the next import if still absent. |
| Wrong mode | The flash names the action ("Checked OUT — going home"); Undo within 6 s. |
| Wrong camper | Undo within 6 s; otherwise a director corrects from the timeline (note required). |
| Two staff act at once | Second write fails validation; UI shows the real state. |
