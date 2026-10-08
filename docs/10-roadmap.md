# 10. Roadmap and open questions

## 10.1 Phases

Effort is for one developer working with the plan above; each phase ends in
something usable.

### Phase 0 — Foundations (2–3 days)
- Repo scaffold: Next.js, Tailwind, shadcn/ui, Supabase client, typed env, CI.
- Supabase staging + prod projects, migration `0001` applied, types generated.
- Auth: login, invite flow, `profiles`, first owner bootstrap.
- Vercel project, Resend domain, env vars, deploy hook pipeline.

### Phase 1 — Roster and people (4–6 days)
- Import wizard end-to-end with the real export (mapping preset, diff preview,
  apply, report, history on the camper page).
- Divisions/bunks admin; users & scopes admin; field visibility settings.
- Camper detail page; search; lists with the five default presets + preset editor.
- **Milestone: the roster is in, staff have logins, lists print.**

### Phase 2 — Operations (5–7 days)
- Scan screen (camera + hardware scanner + search + browse), camper card, modes,
  undo, status machine, status board with realtime, bulk actions, corrections.
- Tags: template model, HTML renderer, PDF via Chromium, batch job, on-demand
  request with office email, print queue page, mark printed.
- PWA shell with cached roster.
- **Milestone: a full dry run of arrival, a mid-day checkout, and tag requests.**

### Phase 3 — Pickup and polish (3–5 days)
- Buzzer handout, lookup/page screens, manual mode, `page_requests` log.
- Bridge package with one adapter once the pager model is known (plus heartbeat and
  offline fallback).
- Health page, daily summary email, Resend webhooks, Playwright test of the check-in
  flow, load check with a 600-camper fixture.
- **Milestone: ready for the program.**

### Phase 4 — Later / optional
- Camper photos on the card (from the registration system if it exports them).
- Full offline write queue with conflict display.
- Drag-and-drop template editor.
- Hebrew/French UI translations.
- Parent-facing SMS ("your child has been checked in") via Twilio, if wanted.
- Read-only shared list links for counselors without accounts.

## 10.2 Open questions (answers change details, not the architecture)

1. **Export values.** The sample had only the header row. I need one real export
   (or a few anonymised rows) to confirm: how division names are written
   (`Hebrew` / `עברית` / `French A`?), how `group_types.bunks` vs
   `group_types.hebrew_bunks` are populated (is `hebrew_bunks` only filled for the
   Hebrew division?), the yes/no spelling in `*_yes_no` columns, and the phone
   format.
2. **One export or one per program?** The file name says "Single Program". If each
   division/program exports separately, the import treats each file as the full
   list for the divisions it contains (already designed for); confirm.
3. **Is `students.id` stable across exports?** The whole matching strategy rests on
   it. If it can change (e.g. re-registration creates a new id), name matching
   becomes the primary path and we should add birth date or parent email to the
   export for a safer composite key.
4. **Pager system make/model.** Determines whether a bridge adapter exists or the
   manual mode is the only mode. A photo of the transmitter and its model number is
   enough to answer.
5. **Label stock and printer.** Name tag and luggage tag physical sizes, whether the
   office prints on a label printer (one per page) or on letter sheets (N-up), and
   the image template files themselves.
6. **Is there one check-in per day or one per program?** The status machine supports
   both; it changes whether an "end of day" reset is needed (new day → everyone
   back to `expected`) or whether `present` persists across days. If daily, add a
   `day_resets` setting that runs `pickup` → `expected` nightly for a new attendance
   cycle, keeping the full timeline.
7. **Authorized pickup.** Should pickup record *who* collected the camper and check
   it against a list? The export has no authorized-pickup field; the design has a
   free-text "picked up by" and an `authorized_pickup` contact role staff can fill in.
8. **Office email(s).** One address or one per division? Settings supports one
   default plus per-request override; a per-division default is a small addition.
9. **Counselor accounts.** Will every counselor get a login (recommended, so every
   scan has a name on it), or will some bunks share a head counselor's device?
10. **Session reuse.** Does the program run yearly with the same staff? That decides
    how much the user/scopes admin needs "copy from last session".
