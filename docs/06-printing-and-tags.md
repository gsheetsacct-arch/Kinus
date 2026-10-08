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

Phase 1: form-based — upload background, set size, a list of layers with numeric
position fields, flags above, and a **live preview** rendered by the same engine
with a chosen camper. Phase 2 (optional): drag-to-position on the preview.

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
