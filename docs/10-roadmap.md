# 10. Roadmap and open questions

## 10.1 Phases

Effort is for one developer working with the plan above; each phase ends in
something usable.

### Phase 0 — Foundations — **done**
- Repo scaffold: Next.js, Tailwind, shadcn/ui, Supabase client, typed env, CI.
- Supabase staging + prod projects, migration `0001` applied, types generated.
- Auth: login, invite flow, `profiles`, first owner bootstrap.
- Vercel project, Resend domain, env vars, deploy hook pipeline (workflows in repo; the Supabase/Vercel/Resend accounts themselves still need to be created, see doc 9).

### Phase 1 — Roster and people — **done**
- Import wizard end-to-end with the real export (mapping preset, encoding guard,
  sparse rows, diff preview, apply, report, history on the camper page).
- Divisions/bunks admin; users & scopes admin; field visibility settings.
- Camper detail page; search; lists with the five default presets + preset editor.
- **Milestone: the roster is in, staff have logins, lists print.**

### Phase 2 — Operations — **done**
- Scan screen (Check in / Check out / Lookup, camera + hardware scanner + search),
  flashes and undo, status machine, status board with realtime, bulk actions,
  corrections.
- Merge fields and value maps (editor with live examples); Publisher data-source
  export (CSV).
- HTML renderer; PDF via Chromium; batches; one-tap request from the card;
  auto-request on first check-in; office email; print queue; mark printed;
  template editor with background images.
- Camps (American / Hebrew / French) with a switcher; speed work for ~1,000 campers;
  loading states everywhere.
- Still to do from this phase: **converting your Publisher templates** (waiting for
  the files: export the design without merge fields as PNG, and tell me which
  fields go where) and the **PWA shell** (moved to phase 3).
- **Milestone: a full dry run of arrival, a mid-day checkout, pickup, and tag
  requests from the card.**

### Phase 3 — Hardening (2–4 days)
- PWA shell (installable, cached roster for spotty Wi-Fi at the gate).
- Health page, daily summary email, Resend webhooks, Playwright test of the
  check-in/out flow, load check with a 600-camper fixture, staff walkthrough.
- **Milestone: ready for the program.**

### Phase 4 — Later / on hold
- **Buzzer / pager** (doc 7): handout, lookup, paging via on-site bridge once the
  pager model is known. On hold by decision.
- Camper photos on the card (if the registration system exports them).
- Full offline write queue with conflict display.
- Drag-and-drop template editor; transliteration transform.
- Hebrew/French UI translations.
- Parent-facing SMS ("your child has been checked in") via Twilio, if wanted.
- Read-only shared list links for counselors without accounts.

## 10.2 Open questions (answers change details, not the architecture)

1. **A clean sample.** The 5-row sample had been re-saved in WPS, which replaced
   the Hebrew with `?????`. The export itself is fine; I still need one untouched
   download (or `.xlsx`) with real Hebrew and French values to run the search,
   sorting and tag-rendering tests against actual data.
2. **One export or one per program?** The file name says "Single Program" but the
   sample mixes five divisions. The import handles both; confirm which it will be.
3. **Is `students.id` stable across exports?** Matching rests on it. If a
   re-registration can create a new id, name matching becomes primary and a birth
   date or parent email in the export would make a safer composite key.
4. **Publisher templates.** Which merges exist (name tag, luggage tag, others?),
   their physical sizes, the printer (label printer vs. sheets), and the `.pub`
   files plus the field names used inside them. Each becomes a native template;
   I need the artwork exported as PNG/PDF at print resolution too.
5. **Conversion tables.** The full list of t-shirt sizes and their codes, division
   short codes, and any other value conversions the templates need. The editor
   will show every distinct value from the roster so you can fill them in, but the
   first set can be seeded from a list if you have one.
6. **Daily or once?** Is check-in once per program or once per day? The status
   machine supports both; daily needs a nightly reset to `expected` (kept as
   history).
7. **Pickup record.** Should "Going home" record who collected the camper? The
   design has an optional free-text "picked up by"; a checked list of authorized
   people would need a field in the export.
8. **Office email(s).** One address or one per division? One default plus a
   per-request override is designed; per-division defaults are a small addition.
9. **Counselor accounts.** Every counselor gets a login (recommended, so every scan
   has a name), or some bunks share a head counselor's device?
10. **Session reuse.** Yearly with the same staff? That decides how much "copy
    from last session" the admin needs.
