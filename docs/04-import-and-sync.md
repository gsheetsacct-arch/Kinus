# 4. Roster import and re-sync

The registration export is the source of truth. Every upload is a *full* snapshot
(for the whole program or for one program/division). Kinus never edits the export;
it absorbs each snapshot, shows exactly what changed, and keeps everything it owns.

## 4.1 Pipeline

```
 Upload file ─► Parse ─► Map columns ─► Match rows ─► Diff ─► Preview ─► Apply ─► Report
   (xlsx/csv)  (SheetJS)  (saved preset)  (source_id)  (field)   (admin    (txn)   (saved)
                                                                 reviews)
```

Each step is a server action; state lives in `imports` / `import_rows`, so an admin
can upload, leave, and come back to the preview.

### Step 1 — Upload
- Accepts `.csv`, `.xlsx`, `.xls`. Stored in the private `imports` bucket as
  `imports/<import_id>/<original name>`. SHA-256 stored; uploading the identical file
  twice is detected and offered as "nothing new".
- Encoding: UTF-8 (with or without BOM) and UTF-16 are detected; CRLF handled.
  Hebrew/French text passes through untouched. If the bytes are neither, the
  parser tries Windows-1255 (Hebrew ANSI) and Windows-1252 (Western/French ANSI)
  and picks the one that yields valid Hebrew/Latin text, so a file re-saved as
  "ANSI" by Excel/WPS still decodes when the characters survived.
- **Lost-text guard.** One sample had been re-saved in WPS, which replaced Hebrew
  with `?????` (`Group ????? 112`); at that point the text is gone for good. The
  parser counts runs of two or more `?` in name, bunk and contact fields; if any
  are found the upload is **refused** with the affected cells listed and the advice
  to upload the original download (or `.xlsx`). An admin can override for a file
  that genuinely contains question marks.

### Step 2 — Parse
- SheetJS reads the first sheet to an array of `{ header: value }` rows.
  Headers are trimmed; blank rows skipped.
- Cell values are kept as strings (no date/number coercion by the parser); typed
  parsing happens in mapping.

### Step 3 — Map columns
A **mapping** is a saved JSON preset `{ exportColumn → kinusField, options }`.
The default preset for the current export:

```json
{
  "columns": {
    "students.id": "source_id",
    "students.first_name": "first_name",
    "students.last_name": "last_name",
    "group_types.division": "division",
    "group_types.hebrew_bunks": "bunk",
    "group_types.french_bunks": "bunk",
    "group_types.bunks": "bunk",
    "ppa.grade": "grade",
    "ppa.t-shirt_size": "tshirt_size",
    "ppa.bunk_preference_1": "bunk_preferences[0]",
    "ppa.bunk_preference_2": "bunk_preferences[1]",
    "ppa.bunk_preference_3": "bunk_preferences[2]",
    "ppa.crown_heights_address": "local_address",
    "ppa.crown_heights_address_cross_streets": "local_address_cross_streets",
    "ppa.medical_considerations": "medical_notes",
    "ppa.allergies": "allergies",
    "ppa.allergies_yes_or_no": "has_allergies",
    "ppa.epipen_yes_no": "has_epipen",
    "ppa.medications_yes_no": "has_medications",
    "ppa.anything_else_we_should_know": "notes_from_parents",
    "mother.first_name": "contact[mother].name",
    "mother.phone": "contact[mother].phone",
    "father.first_name": "contact[father].first_name",
    "father.last_name": "contact[father].last_name",
    "father.phone": "contact[father].phone",
    "father.email": "contact[father].email",
    "ppa.emergency_contact_1": "contact[emergency,1].name",
    "ppa.phone_number_for_emergency_contact_1": "contact[emergency,1].phone",
    "ppa.emergency_contact_2": "contact[emergency,2].name",
    "ppa.emergency_contact_number": "contact[emergency,2].phone"
  },
  "options": {
    "bunkColumnPriority": ["group_types.hebrew_bunks", "group_types.french_bunks", "group_types.bunks"],
    "emptyMeansUnknown": true,
    "booleanYes": ["yes", "y", "true", "oui", "כן"],
    "booleanNo":  ["no", "n", "false", "non", "לא", ""],
    "phoneDefaultRegion": "US",
    "trimWhitespace": true
  }
}
```

Mapping UI: a two-column table (export header → Kinus field dropdown) with the
preset pre-filled. Unmapped columns are not an error: they are kept in
`source_data`. If the file has a header the preset has never seen, the row is
highlighted so the admin can map it or leave it. "Save as preset" stores it.

Typed parsing rules:
- Booleans via the yes/no word lists (case-insensitive). Anything else → `null`
  with a row warning.
- Phones → `phone_e164` via `libphonenumber-js` with the default region; the original
  string is kept as `phone`. Unparseable → stored as entered, `phone_e164 = null`,
  warning.
- Empty cells mean *unknown*: they never overwrite an existing value and are not
  reported as changes (`emptyMeansUnknown`). Most rows in the sample were sparse
  registrations with only id, name and division filled in. An admin can turn this
  off for a specific import to deliberately clear values.
- Division: matched by exact name after trimming within the session. Unknown →
  created (language guessed: Hebrew letters → `he`, otherwise `en`; admin fixes
  later) and listed in the preview under "New divisions".
- Bunk: first non-empty value among `bunkColumnPriority`, matched within the
  camper's division; unknown → created and listed under "New bunks".

### Step 4 — Match rows to existing campers
In order:
1. `source_id` equals an existing camper's `source_id` in this session → match.
2. No `source_id` in the file (future-proofing): normalized `first + last` name
   equals exactly one existing camper in the same division → match
   (`match_method = 'name'`). More than one → `conflict`, admin resolves in preview.
3. Otherwise → `add`.

Duplicates inside the file (same `source_id` twice) → the later row is `conflict`.

### Step 5 — Diff
For each matched row, compare every mapped field (after parsing) with the current
value:
- Comparison is on normalized values (trimmed, booleans parsed, phones E.164) so a
  trailing space is not a change.
- `bunk`: if `campers.bunk_locked_by_staff` is true and the import option
  **"Take bunks from file"** is off, a differing bunk is reported as *"bunk differs,
  kept staff assignment"* (warning, not a change).
- Contacts: import-sourced contacts are rebuilt from the file and diffed as
  `contact[mother].phone: old → new`. Manually added contacts are untouched.
- Unmapped columns: `source_data` is replaced but not reported field-by-field
  (a single "raw data updated" line if the JSON differs).

Result per row: `add` / `update` (with `changes[]`) / `unchanged` / `conflict`.

**Missing from file:** campers in the session whose division is among the divisions
present in the file, and whose `source_id` is not in the file. They are listed under
"Not in this export" and nothing happens to them except `in_latest_import = false`
on apply. If more than `settings.import.missingThresholdPct` of a division would be
flagged, the preview shows a loud warning ("Is this a partial export?").

### Step 6 — Preview
One screen (see doc 8, A6):
- Summary tiles: *Added · Changed · Unchanged · Conflicts · Not in export*, plus
  *New divisions* / *New bunks* chips.
- Tabs for each category. Changed rows expand to a field table
  `field | current | from file`. Conflicts show the candidate campers and a
  "pick / create new / skip" control.
- Options: "Take bunks from file" (default off once bunks have been edited in-app,
  on for a first import), "Also apply to archived campers" (off).
- Buttons: **Apply import** (disabled while conflicts are unresolved) · **Cancel**.

### Step 7 — Apply
One Postgres transaction via `apply_import(import_id)` (service role, admin check
inside): inserts new campers (with fresh `camper_code`), updates changed fields,
rebuilds import-sourced contacts, creates divisions/bunks, sets
`in_latest_import`, marks rows `applied`, stamps the import `applied`. The audit
source is set to `import:<id>` for the transaction so every row change in
`audit_log` points back to this import.

Nothing operational is touched: status, attendance events, buzzer assignments,
print jobs, staff notes, manual contacts, `camper_code`.

### Step 8 — Report
The import page becomes a permanent record: who, when, file, summary, and the full
per-row change list (exportable as CSV). Each camper's detail page shows the same
changes in its history tab, attributed to the import.

## 4.2 Edge cases

| Case | Behaviour |
|---|---|
| Camper changes division | Treated as a normal field change; bunk is re-resolved in the new division; scopes follow automatically because they are evaluated against the camper's current division. |
| Camper removed from the program | Appears under "Not in this export". Admin may archive from there (soft delete; still visible in history and reports). |
| Name spelling fixed in the export | Field change; `camper_code` and printed tags remain valid. The camper card shows a "re-print tag?" hint if a name tag was already printed. |
| Export arrives per program (several files) | Each upload only evaluates "missing" within the divisions found in that file. |
| Header renamed upstream | Unmapped column highlighted in the mapping step; nothing silently dropped because raw rows are retained. |
| Same file uploaded twice | Hash match → "Already imported on <date>; nothing changed". |
| Export has rows with no `students.id` | Falls back to name matching within division; otherwise added with a warning. |
| A value map has never seen a value (e.g. a new t-shirt size) | Import succeeds; the report lists "new values needing a merge mapping" with a link to the value map editor (doc 6.2). |

## 4.3 Testing the diff engine

`lib/import/*` is pure TypeScript (parse → map → match → diff) with no I/O so it can be
unit-tested against fixture files: the real header, Hebrew/French names with
accents and niqqud, yes/no variants, a renamed column, a duplicate id, a moved
division, a Windows-1255 file, the WPS-mangled `?????` file, and the sparse-row
sample in `docs/fixtures/`. These tests are the main guard against a bad import.
