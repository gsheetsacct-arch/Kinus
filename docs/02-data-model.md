# 2. Data model

The draft schema is in [`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql).
This document explains the entities, the decisions behind them, and how the real
export columns map onto them.

## 2.1 The export (as received)

File: `Main Program Report - Single Program export.csv`, 30 columns, CRLF.
Two samples were provided: a header-only file and a 5-row sample (one synthetic
camper plus four mostly-empty registrations). Observed values:

| What | Seen | Consequence |
|---|---|---|
| Divisions | `Division 1`, `Division 2`, `Hebrew Division`, `French Division`, `Bar Mitzvah Program` | Division names are free text; merge fields convert them ("Division 2" → "2") rather than the roster. |
| Bunk columns | `group_types.bunks` (`Bunk Chof`), `group_types.hebrew_bunks` (`Group ????? 112`), `group_types.french_bunks` (new, empty) | One bunk column per language; mapping takes the first non-empty. |
| Phones | `+1 917 222 2222`, `+49 22222222222222` | International with spaces; parsed to E.164, original kept. |
| Yes/no | `No` | Parsed to booleans with a word list. |
| T-shirt | `Youth Small` | Converted for tags by a value map (→ `YS`). |
| Sparse rows | 4 of 5 rows have only id, name, division | Import accepts partial registrations; empty cells mean "unknown", never "clear the existing value". |
| **Encoding** | Hebrew text arrived as literal `?????` (the file is pure ASCII) | The sample had been opened and re-saved in WPS, which dropped the Hebrew; the export itself is fine. Kinus accepts UTF-8/UTF-16 and also detects legacy Windows-1255 (Hebrew) / Windows-1252 (French) files, and refuses a file where `?` runs show the text was already lost, so an accidental WPS/Excel re-save is caught instead of silently importing broken names. Best practice: upload the downloaded file untouched. |

Column mapping:

| Export column | Kinus field | Notes |
|---|---|---|
| `students.id` | `campers.source_id` | **Stable key for re-import matching.** |
| `students.first_name`, `students.last_name` | `first_name`, `last_name` | Hebrew / French / English. |
| `group_types.division` | `division` (lookup by name → `division_id`) | Unknown division names are created on import (with a warning). |
| `group_types.hebrew_bunks`, `group_types.french_bunks`, `group_types.bunks` | `bunk` (lookup within division) | First non-empty, in that order. Empty → unassigned. |
| `ppa.grade` | `grade` | |
| `ppa.t-shirt_size` | `tshirt_size` | Stored as written; converted for printing by merge fields. |
| `ppa.bunk_preference_1..3` | `bunk_preferences` (text[]) | Informational, for bunk assignment by staff. |
| `mother.first_name`, `mother.phone` | contact role `mother` | |
| `father.first_name`, `father.last_name`, `father.phone`, `father.email` | contact role `father` | Family last name fallback for mother. |
| `ppa.emergency_contact_1`, `ppa.phone_number_for_emergency_contact_1` | contact role `emergency`, slot 1 | |
| `ppa.emergency_contact_2`, `ppa.emergency_contact_number` | contact role `emergency`, slot 2 | |
| `ppa.crown_heights_address`, `…_cross_streets` | `local_address`, `local_address_cross_streets` | Where the camper is staying locally. |
| `ppa.medical_considerations` | `medical_notes` | sensitive |
| `ppa.epipen_yes_no`, `ppa.medications_yes_no`, `ppa.allergies_yes_or_no` | `has_epipen`, `has_medications`, `has_allergies` (bool) | sensitive |
| `ppa.allergies` | `allergies` | sensitive |
| `ppa.anything_else_we_should_know` | `notes_from_parents` | sensitive |
| *(everything else / future columns)* | `campers.source_data` (jsonb) | The whole raw row is kept, so new columns are never lost. |

"Single Program export" suggests one file per program. The import pipeline supports
both one file for everything and one file per division: the "missing from export"
check is scoped to the divisions actually present in the uploaded file.

## 2.2 Entity overview

```
sessions ──< divisions ──< bunks ──< campers ──< camper_contacts
                                        │
                                        ├──< attendance_events   (timeline; drives campers.status)
                                        ├──< buzzer_assignments  ──< page_requests
                                        ├──< print_job_items >── print_jobs ── print_templates
                                        └──< import_rows >── imports ── import_mappings

profiles (auth user + global role) ──< staff_scopes (division, bunk?, level)
list_presets, field_visibility, settings, audit_log
```

### sessions
One row per run of the program (year). Everything operational hangs off a session.
`is_active` picks the one staff see by default. Older sessions are read-only.

### divisions, bunks
Divisions carry a `language` (`he` / `fr` / `en`) that drives default fonts on
tags and sort collation, and a `sort_order` for lists. Bunks belong to a division.
Both are created by import when missing, and editable by admins (rename, reorder,
merge).

### campers
The roster record. Important columns:

- `camper_code` — Kinus's own 6-digit code (5-digit sequence + Luhn check digit),
  assigned once, printed in the barcode. Unique across all sessions.
- `source_id` — the export's `students.id`. Unique per session.
- `first_name`, `last_name`, `display_name` (generated), `name_normalized`
  (generated; accent- and niqqud-insensitive, for search).
- `division_id`, `bunk_id`, plus `bunk_locked_by_staff` — when staff move a camper
  to a different bunk in the app, re-import does not overwrite it unless the admin
  chooses "take bunks from file" on that import.
- `status` (enum, see 2.3) and `last_event_id` — denormalized from
  `attendance_events` by trigger; this is what the status board reads.
- `current_buzzer_number` — denormalized from `buzzer_assignments`.
- Medical and parent-note fields (sensitive; see field visibility in doc 3).
- `in_latest_import` — false when the latest import of that division did not contain
  the camper. Shown as a warning badge; nothing is deleted automatically.
- `source_data` — the raw export row.
- `archived_at` — soft delete, admin only.

### camper_contacts
One row per person: `role` (`mother`, `father`, `guardian`, `emergency`, `host`,
`authorized_pickup`), `name`, `phone` (stored as entered plus `phone_e164` for the
`tel:` link), `email`, `slot` (1, 2 …), `is_primary`. Import rebuilds the rows that
came from the file (tagged `source = 'import'`); rows staff added by hand
(`source = 'manual'`) are kept.

### attendance_events
Append-only. `event_type` ∈ `arrival`, `leave`, `return`, `pickup`, `no_show`,
`correction`; `method` ∈ `scan`, `manual`, `bulk`; `recorded_by`; `occurred_at`;
`note`; `resulting_status`. Inserted only through the `record_attendance()` function,
which validates the transition and updates the camper. Corrections are new events
that point at the one they fix (`corrects_event_id`), so history is never rewritten.

### buzzer_assignments, page_requests (on hold)
The pager feature is deferred; the tables stay in the schema because they cost
nothing and the pickup flow does not depend on them.
An assignment is open while `released_at is null`. Partial unique indexes guarantee
one open assignment per buzzer and per camper. `page_requests` is both the queue the
on-site bridge consumes and the log of every page (`status`: `queued`, `sent`,
`failed`, `manual`).

### imports, import_rows, import_mappings
See [doc 4](04-import-and-sync.md). `import_rows.changes` holds the field-level
`[{field, old, new}]` list that the preview and the post-import report show.

### print_templates, merge_fields, value_maps, print_jobs, print_job_items
See [doc 6](06-printing-and-tags.md). A template consumes **merge fields**, each a
camper field passed through transforms (value maps such as Youth Small → YS, regex
such as "Division 2" → "2"). A job is a request to print one template for one or
more campers, delivered to an email address, with a rendered PDF in Storage.
Templates flagged `show_on_card` get a one-tap button on the camper card;
`auto_on_first_checkin` requests them automatically on first check-in.

### profiles, staff_scopes, field_visibility, list_presets, settings
See [doc 3](03-permissions.md). `settings` is a key/value table for things like the
office email, pager mode, active session, and the on-the-spot override defaults.

### audit_log
Trigger-populated. `actor_id`, `table_name`, `row_id`, `action`, `before`, `after`,
`diff` (changed keys only), `source` (`ui` / `import:<uuid>` / `system`), `at`.

## 2.3 Camper status machine

```
             arrival                 leave
  expected ──────────► present ◄──────────► out
     │                    │       return      │
     │ no_show            │ pickup            │ pickup
     ▼                    ▼                   ▼
  no_show              departed ◄─────────────┘

  correction: any → any (admin/director only, requires a note)
  re-arrival: departed → present (allowed, with confirmation; e.g. came back next day)
```

| Status | Meaning | Board colour |
|---|---|---|
| `expected` | On the roster, not yet checked in | grey |
| `present` | On site | green |
| `out` | Checked out temporarily (doctor, left with parent for an hour) | amber |
| `departed` | Picked up / left for good | blue |
| `no_show` | Never arrived (set in bulk at end of day/program) | red outline |

The transition table lives in one pure TypeScript module (`lib/attendance/machine.ts`)
and is mirrored in the Postgres function so the UI can show the right buttons and the
database can refuse anything else.

## 2.4 Search

`search_campers(session_id, q, limit)`:
1. If `q` is all digits: exact match on `camper_code`, then prefix match, then phone
   number match on contacts.
2. Otherwise: normalize `q` the same way as `name_normalized` and rank by
   `similarity()` (pg_trgm) on full name, with a boost for prefix matches on first or
   last name. Also matches the first token against first name and the second against
   last name in either order, so "Cohen Dovid" and "Dovid Cohen" both work.
3. Results are already RLS-filtered to the caller's scope.

Multilingual notes: trigram similarity works per character, so Hebrew and French
behave the same as English once accents and niqqud are stripped. Transliteration
(typing "Cohen" to find "כהן") is **not** attempted in v1; the fallback for that case
is browsing by bunk, which is two taps away.

## 2.5 Identifiers in barcodes

Barcode payload: `KN` + `camper_code`, e.g. `KN104275`. The prefix lets the scan
listener distinguish a camper tag from anything else a scanner might read. Symbology: Code 128 on tags (dense, reads well with
cheap scanners), optionally a QR with the same payload for phone cameras in poor
light. Both carry the same payload so the handler is the same.
