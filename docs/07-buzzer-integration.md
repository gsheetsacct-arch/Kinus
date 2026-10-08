# 7. Buzzer / pager integration

## 7.1 How it works today (as described)

At the end of the program, campers wear restaurant-style pagers. When a parent
arrives, staff dial the pager's number on the transmitter and it buzzes; the camper
comes to the pickup point. Kinus needs to (a) know which camper has which buzzer,
(b) let staff find the number instantly, and (c) optionally trigger the page itself.

The vendor/model of the pager system is not known yet. The design below works with
no integration at all and gets better with one.

## 7.2 Data

- `buzzers` — the physical set for the session (number, label, active). Created on
  the fly on first assignment or in bulk ("buzzers 1–150").
- `buzzer_assignments` — open while `released_at is null`. One open row per buzzer
  and one per camper (enforced by partial unique indexes). Final pickup releases
  automatically (`record_attendance`); so does "Release" on the camper card and
  "Release all" at the end of the day.
- `page_requests` — every page attempt: queued / sent / failed / manual. This is the
  queue the bridge consumes and the audit trail ("paged 3× from 16:02").

## 7.3 Screens

**Handout** (`/buzzers/handout`): scan the camper, then type the buzzer number or
scan a `BZ<number>` label stuck on the pager. Two scans, zero typing. Shows the
last 5 assignments so mistakes are visible. Hardware scanner friendly.

**Lookup / page** (`/buzzers`): big search box (name, code, phone) → result rows
show **the buzzer number in very large type**, name, bunk, status, and a **Page**
button. In manual mode the Page button simply logs a `manual` request and shows
"Dial 17 on the transmitter" — staff dial it. In bridge mode it queues a request and
shows sent/failed within a second. Also lists "campers with a buzzer, not yet picked
up" as a live board for the pickup desk, sorted by assignment time.

**Camper card** (doc 5): shows the buzzer number when assigned; in Pickup mode the
number is the biggest thing on the screen.

## 7.4 Integration options

Pager transmitters live on the camp's LAN or hang off a serial/USB port. Vercel
cannot reach them, so integration goes through a **bridge**: a tiny Node service
(`bridge/`) that runs on a laptop or Raspberry Pi at the pickup desk.

```
Kinus (Supabase) ──realtime: page_requests INSERT (status=queued)──► bridge ──► transmitter
                 ◄──update status=sent | failed (+ error) ───────────┘
```

- Bridge auth: a dedicated service key stored only on that device, scoped by a
  Postgres role that can read/update `page_requests` and nothing else.
- Bridge heartbeat: writes `settings.pager.bridge_seen_at` every 30 s; the UI shows
  a green "Bridge online" dot. If the bridge is offline, the Page button falls back
  to manual instructions automatically, and queued requests older than 2 minutes
  are marked `failed` with "bridge offline" by the cron sweep.
- Transmitter adapters (`bridge/adapters/*`), one per vendor, with a single
  interface `page(number): Promise<void>`:
  - **LRS / Long Range Systems**: cloud API (LRS Connect) for newer units; serial
    protocol for older T7400-series transmitters.
  - **JTECH**: serial/Ethernet command protocol.
  - **Retekess / generic Chinese transmitters**: usually no API; some expose a USB
    HID keypad that can be driven with a small keyboard emulator; otherwise manual.
  - **Keyboard-emulation fallback**: if the transmitter is driven by a numeric
    keypad, a USB HID emulator (e.g. a microcontroller) can type the number; this is
    a last resort and is documented, not planned.
- If the vendor turns out to have a reachable cloud API, the bridge is unnecessary:
  the same `page_requests` queue is consumed by a Vercel route handler instead.

## 7.5 Manual mode is a first-class mode

`settings.pager.mode = 'manual'` is the default and must remain fully usable for the
whole program: lookup by name/scan → read the number → dial. Nothing in the pickup
flow depends on the bridge. The integration only removes the "dial" step.

## 7.6 Edge cases

| Case | Behaviour |
|---|---|
| Buzzer already on another camper | Handout screen shows who has it and offers "Move it" (releases the other). |
| Camper already has a buzzer | Shows current number, offers "Replace". |
| Pager lost | Release with reason "lost"; buzzer marked inactive for the session. |
| Parent arrives before buzzer handout | Pickup from the camper card still works; no buzzer step. |
| Page didn't buzz | Page again (new request row); after 2 failures the UI suggests dialing manually and shows the number. |
