# 6. Mail merges, tags and printing

## 6.1 What a "mail merge" is in Kinus

A **template** (name tag, luggage tag, bus card, anything you design) plus a set of
**merge fields** (the named values the template consumes) produces one printable
page per camper. Templates are designed outside Kinus (Publisher) and converted
once; after that every camper, batch or single, merges the same way.

| Template | Typical content | Barcode |
|---|---|---|
| Name tag | First name large, last name, division band, bunk, camper code | Code 128 `KN100016` (+ QR optional) |
| Luggage tag | Full name, division, bunk, code, local address, office phone | Code 128 |
| Bunk sheet | One page per bunk: names + barcodes grid | Code 128 per row |
| … | Any further Publisher design you supply | optional |

## 6.2 Merge fields and value conversions

Templates do not read camper columns directly. They read **merge fields**, each of
which is a camper field passed through a chain of **transforms**. This is where
"Youth Small → YS" and "Division 1 → 1" live, and it is what lets a Publisher
template built against field names like `TSHIRT` keep working.

| Transform | Example | Behaviour on no match |
|---|---|---|
| **Value map** (lookup table) | `tshirt_size`: Youth Small → YS, Youth Medium → YM, Adult Small → AS | `fallback`: *passthrough* (print the original), *blank*, or *error* (flagged on the job, tag still prints with a ⚠ in the queue) |
| **Regex** | `division.name`: `^Division (\d+)$` → `$1`, so "Division 2" → "2"; "French Division" → unchanged | passthrough |
| **Template** | `{{first_name}} {{last_name}}` or `{{bunk.name}}` | — |
| **Case / trim / truncate** | upper, title, first 12 chars | — |
| **Transliterate** (later) | Hebrew → Latin for an English-only font | — |

Admin UI (`/print/merge-fields`):
- A list of merge fields: key (as the template uses it), label, source field,
  transform chain, sample output for a chosen camper.
- The **value map editor is seeded from real data**: pick the source field and it
  lists every distinct value currently in the roster with a count, with an empty
  "output" column to fill in. Unmapped values are highlighted, and a new import that
  introduces a never-seen value ("Youth XS") shows up as a warning on the import
  report and on the next print job. Case and whitespace are ignored when matching.
- A merge field can be previewed against any camper, including the long-name and
  Hebrew edge cases, before it is used.

Default merge fields to ship: `FIRST`, `LAST`, `FULL`, `CODE`, `BARCODE`
(`KN`+code), `DIVISION` (full name), `DIV` (short code via value map),
`BUNK` (name), `BUNK_SHORT` (value map), `GRADE`, `TSHIRT` (value map),
`ADDRESS`, `CROSS_STREETS`, `MOTHER_PHONE`, `FATHER_PHONE`.

## 6.3 Templates from Publisher

You design in Publisher; Kinus prints. Two paths, both supported:

**A. Native Kinus template (used for on-demand printing).** One-time conversion of
each `.pub` design: the static artwork is exported from Publisher as a PNG/PDF
background, and each merge field placeholder becomes a positioned text/barcode
layer in Kinus's template model. The original `.pub` is stored alongside for
reference. After conversion the template renders anywhere (browser, PDF, email)
with no Publisher involved. I do this conversion when you hand over the files; the
editor (6.4) lets you nudge positions afterwards.

**B. Publisher data-source export (zero conversion, batch only).** `/print/export`
produces a CSV/XLSX whose column headers are exactly the merge field keys, already
converted (YS, 2, …), for any scope (division, bunk, all, changed since last
export). The office opens it as the data source in Publisher and runs the merge
there. Good for the first big print run before the program, and as a fallback if a
template has not been converted yet.

**Converted so far** (originals in [`docs/templates/`](templates/), migrations `0010` and `0011`):

| Publisher file | Kinus template | Notes |
|---|---|---|
| `labels_4x6_template.pub` | Label 4×6 (Hebrew name) | 152.4 × 101.6 mm, one per label |
| `labels_small_template.pub` | Label 4×6 (English name) | same layout, English name instead of Hebrew |

Publisher field → Kinus field:

| Publisher | Kinus | Reads |
|---|---|---|
| «ppa#hebrew_name», «ppa#hebrew_last_name» | `{{HEB_FIRST}}`, `{{HEB_LAST}}` | export columns `ppa.hebrew_name`, `ppa.hebrew_last_name` |
| «ppa#first_name», «ppa#last_name» | `{{FIRST}}`, `{{LAST}}` | the camper's name |
| «F88», «F89» «F90» | `{{FROM}}` | `ppa.city`, `ppa.state` `ppa.country`, tidied when a part is empty. These were unnamed columns 88–90 in the spreadsheet; city/state/country is a best guess from the layout |
| «bunk hebrew» | `{{BUNK_HEBREW}}` | `group_types.hebrew_bunks`, else the bunk, without "Bunk " |
| «F15» | `{{BUNK_BIG}}` | the bunk without "Bunk ". Unnamed column 15 in the spreadsheet: change BUNK_BIG under Print → Fields if it was something else (e.g. a bunk number via a conversion table) |
| «group_types#division» | `{{DIVISION}}` | |
| «ppa#t-shirt_size» | `{{TSHIRT}}` | converted (Youth Large → YL) |
| «ppa#yarmulka_size» | `{{YARMULKA}}` | export column `ppa.yarmulka_size` |
| «camper_id» | `{{CODE}}` up the left side, small and grey | the camper number (migration 0011) |

Any column of the registration export can be used in a field as
`{{source.<column header>}}` (Publisher's `#` and the export's `.` are the same), and
`{{a|b}}` takes the first that isn't empty.

Template model (path A), stored as JSON on `print_templates`:

```json
{
  "kind": "name_tag", "name": "Name tag 2026",
  "page_width_mm": 90, "page_height_mm": 55,
  "background_path": "templates/<id>/bg.png",
  "layers": [
    { "type": "text", "field": "FIRST", "x": 8, "y": 14, "w": 74, "h": 14,
      "font": "Noto Sans Hebrew", "size": 22, "weight": 700, "align": "center",
      "fit": "shrink", "dir": "auto" },
    { "type": "text", "field": "LAST", "x": 8, "y": 28, "w": 74, "h": 8, "size": 12, "align": "center" },
    { "type": "text", "template": "{{DIVISION}} · {{BUNK}}", "x": 8, "y": 38, "w": 74, "h": 6, "size": 9 },
    { "type": "barcode", "symbology": "code128", "field": "BARCODE", "x": 20, "y": 44, "w": 50, "h": 8, "text": true }
  ],
  "sheet_layout": { "paper": "letter", "cols": 2, "rows": 5, "marginMm": 10, "gapMm": 3 },
  "show_on_card": true, "auto_on_first_checkin": true, "sort_order": 1
}
```

- Millimetre units so a template matches the physical label.
- `fit: "shrink"` reduces the font until the text fits its box (long French
  double-barrelled names, short Hebrew names).
- `dir: "auto"` renders a Hebrew name RTL inside an otherwise LTR tag.
- Per-division templates override the default by setting `division_id`.
- `sheet_layout` imposes batches N-up on letter/A4; without it, one tag per page
  for a label printer.
- `show_on_card` puts a one-tap button on the camper card; `auto_on_first_checkin`
  requests it automatically on the camper's first check-in; `sort_order` orders
  the buttons.

## 6.4 Template editor (admin)

A canvas of the tag at real proportions (Print → Templates):

- Click a part to select it, drag to move, pull the handles to resize; arrow keys
  nudge 0.5 mm (Shift: 5 mm), Delete removes. Parts snap to a 0.5 mm grid and to the
  tag's centre lines and edges, and stay on the tag.
- "+ Add a field" drops a text box with that field; also plain text, barcode, QR and
  a colour block (division colour or any colour).
- Text size is a **target**: short text prints at that size, longer text shrinks to
  stay inside its box, never below "never smaller than". The panel says what happens
  for the camper shown ("Shrinks to 21 pt for this camper"), and warns when it
  doesn't fit at all. Give long fields a wider box rather than a smaller size.
- Show it with a sample camper, the camper with the longest name, or any camper by
  code; "Print preview" shows the exact print rendering for the same camper.
- The canvas uses the print fonts, so what fits on screen fits on paper.

Fields: only fields **on the merge list** (Print → Fields & conversions) are offered
in the editor and included in the data for Publisher. Contact details start off the
list. A template that already uses an off-list field still prints it, and the editor
says so.

## 6.5 Rendering pipeline

```
template + merge fields + camper(s) ─► HTML (React, print CSS, mm units, embedded fonts, SVG barcodes)
                                    ─► headless Chromium (puppeteer-core + @sparticuz/chromium) ─► PDF
                                    ─► Storage: print-output/<job_id>.pdf
```

- Route handler `POST /api/print/render` (Node runtime, `maxDuration` 60 s). One
  Chromium launch per job; 300 tags render in seconds.
- Barcodes via `bwip-js` as inline SVG.
- Fonts: Noto Sans + Noto Sans Hebrew bundled; the PDF embeds them.
- The same HTML is served at `GET /print/jobs/<id>/preview` so the office can also
  press **Print** in the browser. Zero-dependency fallback.

## 6.6 On-demand request from the camper card

1. Staff taps a template button on the card (Name tag / Luggage tag / …).
   Long-press: copies, and a one-off "send to" override (the last override is
   remembered on that device as a suggestion). Default destination:
   `settings.office_email.to`.
2. Server action creates `print_jobs` (`queued`) + `print_job_items`, then calls
   the worker immediately; Vercel Cron sweeps the queue every minute as a safety net.
3. Worker: `rendering` → PDF to Storage → Resend email with the PDF attached
   (subject `Name tag · מנחם כהן · Group 112 · req. by Shmuli`, body links to the
   job) → `sent`. Failure → `failed` with the error; the card button turns red with
   **Retry**.
4. Office **Print queue** (`/print`), realtime: who, what, for whom, status,
   **Open PDF**, **Mark printed**, **Re-send** (with "to" override). Marking printed
   updates the card ("Printed 9:44").

## 6.7 Batch printing (before the program)

`/print/batch`: template, scope (division / bunk / all / only campers without a
printed tag / only campers whose merge output changed since last print), copies,
sheet layout → one job → one PDF. Also "Bunk sheets for division X", and the
Publisher data-source export (6.3 B) from the same screen.

## 6.8 Email (Resend)

- Verified domain (SPF/DKIM); from `tags@<your-domain>`.
- Attachment limit 40 MB covers hundreds of tags; above that the email carries a
  signed Storage link (7 days) and says so.
- React Email templates: `PrintJobEmail`, `StaffInviteEmail`, optional
  `DailySummaryEmail`.
- `email_message_id` recorded per job; Resend webhooks (delivered / bounced)
  update the queue so bounces are visible.
