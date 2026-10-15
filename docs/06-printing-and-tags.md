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
| **Hebrew letters / numbers** (`hebrew_number`) | `bunk`: "Bunk Yud Alef", "יא", "י״א" or "Bunk 11" → digits **11**, Hebrew letters **יא**, or with marks **י״א**; 15 → טו, 16 → טז; any spelling Alef-Beis sorting knows (Ashkenazi, Sephardi, Israeli). *Keep the words*: "Bunk Yud Alef" → "Bunk 11". Ready-made fields `{{BUNK_NUMBER}}` and `{{BUNK_LETTERS}}` (migration 0030) | text without a number is left as it is |
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
  "sheet_layout": { "paper": "letter", "cols": 2, "rows": 4, "leftMm": 17.46, "topMm": 14.82,
                    "pitchXMm": 95.25, "pitchYMm": 63.5, "preset": "avery-5395",
                    "shiftXMm": 0, "shiftYMm": 0 },
  "show_on_card": true, "auto_on_first_checkin": true, "sort_order": 1
}
```

- Millimetre units so a template matches the physical label.
- `fit: "shrink"` reduces the font until the text fits its box (long French
  double-barrelled names, short Hebrew names).
- `dir: "auto"` renders a Hebrew name RTL inside an otherwise LTR tag.
- Per-division templates override the default by setting `division_id`.
- `sheet_layout` places tags on Letter/A4 label sheets: the first label's top-left
  corner and the pitch (start of one label to the start of the next), exactly as
  the label maker publishes them. `shiftXMm`/`shiftYMm` make up for a printer that
  prints a little off. Without it, one tag per page for a label printer. Older
  templates with only `marginMm`/`gapMm` are centred across the page as before.
- `show_on_card` puts a one-tap button on the camper card; `auto_on_first_checkin`
  requests it automatically on the camper's first check-in; `sort_order` orders
  the buttons.

## 6.4 Template editor (admin)

A canvas of the tag at real proportions (Print → Templates):

- Click a part to select it, drag to move, pull the handles to resize; arrow keys
  nudge 0.5 mm (Shift: 5 mm), Delete removes. Parts snap to a 0.5 mm grid and to the
  tag's centre lines and edges, and stay on the tag.
- **Several parts at once**: Shift-click (or Ctrl/⌘-click) parts on the tag or in the
  parts list, drag a box around them on an empty spot (works with a finger on an iPad),
  or Ctrl+A. Dragging any of them moves them together (the group snaps and stays on the
  tag as one); arrows nudge them together; Ctrl+D copies them; Delete removes them.
- **Line up**: with one part, its left / centre / right / top / middle / bottom goes to
  the tag's; with several, they line up with each other (the box around them), and
  three or more can be **spread out evenly** across or up and down.
- **Lock** (padlock, in the panel or the parts list): a locked part can't be dragged,
  resized, nudged or removed with the Delete key, and dragging across it draws a
  selection box instead, so a background colour block stops getting in the way.
  Clicking it still selects it, to unlock it. **Hide** (eye): a hidden part isn't shown
  and doesn't print (nor count for "changed since printed"); it stays in the parts list,
  crossed out, to show again. Saved as `locked` / `hidden` on the part.
- "+ Add a field" drops a text box with that field; also plain text, barcode, QR and
  a colour block (division colour or any colour).
- Text size is a **target**: short text prints at that size, longer text shrinks to
  stay inside its box, down to its "smallest size". The size can't be set bigger
  than the box holds ("This box holds text up to 37 pt"; typing more settles there; a
  box made shorter afterwards says "too big for it" with a one-tap fix).
- The panel says what happens for the camper shown ("Shrinks to 21 pt for …"), and
  **Every camper** measures the part for every camper in the camp, in the same fonts and
  steps as print: who'd be cut off even at the smallest size (names, tap one to show
  that camper), or the smallest size anyone gets.
- **Longer names later** (a camper added after the template was made): a name that
  doesn't fit at the smallest size still prints **whole**: it keeps shrinking, down to
  4 pt (`FLOOR_PT`), and is never cut off for that. The printed page marks it
  (`data-small`), and the office is told: on the print screen ("Printed smaller to fit:
  Yisroel Menachem Mendel (16 pt)") and in the request email. The editor shows the same
  in amber ("1 of 610 go under 30 pt so they fit", "Smaller to fit" on the canvas), with
  **Allow 2 lines**, a wider box, or "**16 pt is fine**" (makes that the smallest size).
  Only text that doesn't fit even at 4 pt is cut (red "Cut off"), or text in a part with
  shrinking turned off.
- **Fonts**: Clear (Noto Sans, the default), Friendly (Rubik), Classic (Frank Ruhl
  Libre), Bold display (Secular One), all with Hebrew; plus bold, italic, underline.
  Each is embedded in the printed page (`lib/print/fonts`, OFL).
- **Line height** is per font (1.3 × the size; 1.5 for Bold display), measured from the
  fonts so accents (É, Å), tails (g, y, ק) and Hebrew vowel points are never clipped.
  The canvas, the every-camper check and the printed page use the same CSS
  (`lineHeightOf`, `minPt`), so the size the editor shows is the printed size.
- Show it with a sample camper, the camper with the longest name, or any camper by
  code; "Print preview" shows the exact print rendering for the same camper.
- The canvas uses the print fonts, so what fits on screen fits on paper, and shows
  the real barcode and QR code. Selecting a barcode says whether it will scan: bars
  thinner than 0.25 mm, or shorter than 6 mm, get a warning with the size to use.
- **Labels**: "Choose labels" lists the label stock Kinus knows exactly
  (`lib/print/presets.ts`): Avery US Letter sheets (5160, 5161, 5162, 5163, 5164,
  5167, 5168, 5366, 5395, 5390, 5392, 5371…), Avery A4 sheets (L7160, L7163,
  L7651…), and label-printer rolls (Zebra/Rollo 4×6 and smaller, Dymo, Brother).
  Round labels (Avery 8293 / 94506, 1½″, 20 per sheet) are marked `shape: "round"`: the
  editor shows the circle with its cut line dashed, the sheet drawing shows circles, and
  the print clips each tag to its circle (`isRoundLabel`).
  Search by any number on the box (8160 finds 5160). Picking one sets the label size
  and sheet layout and scales the design to fit. "Print a test sheet" fills a sheet
  with outlines to hold against the labels; "Move right/down" corrects a printer
  that prints a little off. Print at **Actual size / 100%**, never "Fit to page".
- Template options: **Print button at check-in** adds a button for the template to
  every camper's card (Check in and the camper's page), for staff to send a
  replacement tag to the office. **Print by itself at first check-in** queues it
  automatically the first time each camper is checked in.

- **Undo / redo** (buttons, Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y; up to 100 steps; a drag,
  a typed word or a run of nudges is one step). **Copy** (button or Ctrl+D), **Ctrl+S**
  saves.
- **Pictures** (a camp logo…): "Picture" uploads a PNG/JPG/WebP up to 2 MB
  (`uploadTemplateImage`, storage `templates/pictures/…`) and places it at its own
  shape; "Whole picture" or "Fill the box"; "Another picture" swaps it. In print each
  picture is in the page once (`renderDocument(…, { images })`, `imageDataUrls`).
  **A different picture per division**: under a picture part, each division of this
  session can have its own picture, the main one, or none (`byDivision`, by division
  name so it carries over to next session's divisions; "" = none). The merge values carry
  the camper's division name (`__division`) and `pictureFor` picks the picture; tapping a
  division shows the tag as its campers get it. A template with per-division pictures
  counts a move to another division as a changed label.
- **What it's for**: Print a batch and the camper card's "How many?" take a short note
  (what it is and what it's for); it's saved on the request (`print_jobs.note`, before the
  batch's place and which campers) and shows in the queue, on the request and in the email.
- Tag PDFs on Vercel: Chromium (`@sparticuz/chromium`) stays out of the bundle and its
  compressed files (`bin/`) are traced into every function by `outputFileTracingIncludes`;
  without them the PDF fails with "input directory … does not exist".
- **For which camps** (Template settings; migration 0036): tick the camps a template is for
  (`print_templates.camps`, by camp name so it carries over to next session's camps; none
  ticked = every camp). Print a batch offers the current camp's templates (all of them when
  looking at every camp, named with their camps) and prints only those camps' campers; the
  camper card shows a template's button only for its camps' campers; printing at first
  check-in and "new or changed labels" keep to them too; a request for a camper of another
  camp is refused (`lib/print/template-camps.ts`). The templates list shows "… only".
- **Two-sided tags** ("Print on both sides" over the tag; migration 0035): Front and Back
  tabs over the canvas; parts added while the back shows go on the back (`side: "back"`);
  the background image is on the front. `print_templates.back` = { flip: long | short,
  back nudge }. Printing: on label sheets each sheet is followed by its back page, laid out
  mirrored (long edge: left and right swap; short edge: top and bottom swap) so each back
  lands behind its own front, plus the back nudge for a duplex printer that's a little off;
  one tag a page prints front, back, front, back. Labels already used on a part-used sheet
  get no back. The print screen reminds the office to turn on two-sided printing with the
  right flip.
- Colour blocks can be **outline only** or have a **border**; new colour blocks go to the
  back (they're backgrounds and strips). Selecting a part keeps it in its place in the
  stack: its outline and handles are drawn on top, so a full-tag block doesn't cover the
  text.
- Warnings: a field that doesn't exist (`{{BARCOD}}`, `{{first}}`) is named, with the
  likely one ("did you mean {{FIRST}}?"), since it prints empty. A barcode or QR code
  that's empty for the camper shown shows as a red "empty" box; a text part whose fields
  are all empty is faded (it prints nothing for that camper). **What the fields say**
  lists every field the template uses and its value for the camper shown.
- "Show it with: **The longest text**" checks every camper and shows the one whose text
  is longest for its box on this template's parts (names, bunks, Hebrew…).
- Number boxes only take numbers they can use (an emptied box goes back to its number,
  never 0); parts stay on the label when its size is typed. The save check accepts what
  the editor allows and names the part when something's off ("Part 3 (the barcode): its
  width is out of range").
- Changes made while saving stay "unsaved". Unsaved work is kept on that computer:
  leaving by Back, closing the laptop or a crash offers **Bring them back** next time.
- **Turn the label sideways** (label printers) turns the design with the label: parts keep
  their places, text and barcodes turn; turning again turns it back.
- Retired templates say so in the editor and aren't offered on camper cards; a copy of
  one is a normal template.
- The print preview uses the background as saved (one uploaded this visit included).
- Shrink-to-fit uses the same half-pixel steps in the editor and in print.

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
- Barcodes via `bwip-js` as inline SVG, Code 128 with a 10-bar-width blank margin
  each side built in (scanners need it; a colour block drawn next to the bars can't
  take it away), QR codes with a 2-square margin.
- Fonts: Noto Sans + Noto Sans Hebrew, and the template's other fonts (Rubik, Frank Ruhl
  Libre, Secular One) bundled; the page embeds the ones it uses, so the PDF does too.
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

### How many of each

A template says how many labels each camper usually gets (`print_templates.copies`,
migration 0028; Template settings → **How many per camper**, 1–10; the templates list shows
"2 per camper"). It's the starting number everywhere:
- the camper card's button ("Luggage tag ×2": one tap asks for 2) and its **How many?**
  (quick 1–4, or type up to 10; remembers nothing, starts at the usual number each time);
- batches (Copies of each starts at it); automatic prints at first check-in; "print the
  new ones".
When printing (one request or several together) **How many of each** can override it for
that print: *As asked* (each request's own number) or 1–4 of each.

Before migration 0028 everything keeps working with one of each (templates are read
whole; saving a number other than 1 asks for the migration).

### Printing order

Every print is sorted by division (1, 2, 3…, then the rest), bunk (Alef-Beis order), then
name; campers without a division or bunk come last, and copies of a label sit together
(`byBunkThenName`). On label sheets, copies stack down a column: with 2 each, a camper's
two labels are one over the other and the next camper is beside them (`stackColumns`).
The labels filled are the same ones as before (the next free ones, so the remembered
sheet stays right); only which tag goes where changes. That holds for single requests, batches, requests printed together
(the left-overs from check-in) and each division printed on its own.

### Printing requests together

The queue groups waiting requests for the same template ("Name tag: 4 requests
waiting · 6 tags → **Print together**"); selecting several and **Print together**
does the same. `/print/together?jobs=…` prints them as one document, sorted by
division and bunk: **All together**, or **One division at a time** (each division
its own print; the requests are marked printed once the last one is done). A camper
asked for in more than one request prints once, with the most copies asked
(`loadPrintSet` in `lib/print/jobs.ts`; page `/print/sheet?jobs=…&division=…&start=…`).

### Part-used label sheets

For templates on label sheets (Avery 5160: 30 to a sheet…) Kinus remembers, per camp and
label stock (the sheet preset, or paper + grid + label size), **which labels on the sheet
in the printer are used** (`settings.label_sheet:<camp>/<stock>` → `{ used: [1, 2, 5] }`,
`lib/print/sheet-position.ts`). Templates on the same stock share it (it's one physical
sheet). The print screen shows the sheet: used labels hatched, the labels this print fills
in blue. Tags go into the free labels in order; later sheets fill from the top.

- **Tap where it starts** (default): tap the first free label of whatever sheet is in the
  printer; everything before it counts as used.
- **Tap each used label**: for a sheet with labels gone here and there; tap again to undo.
- **Fresh sheet**: the last sheet was thrown out or can't be found. Saved at once.
- **Remember this sheet**: saves a set-up sheet without printing.
- After printing, "Did they print properly? → Yes" marks the requests printed and saves the
  sheet as it is now (a sheet that ends full means a fresh one next).

The used labels show on screen only, never print (`renderDocument(…, { usedSlots })`).
Older saved positions (`next`, or the single `label_sheets` row) still count. The emailed
PDF always starts at label 1; the email says to print from Kinus to use a part-used sheet.

### New and changed since the print

The print queue checks (when opened, then every 2 minutes) for labels to print again,
per template (`lib/print/updates.ts`):
- **changed**: printed labels (marked printed) whose camper's values for the template's
  fields differ now (a bunk move, a corrected name). Each label keeps a per-field
  fingerprint (`contentHash` "v2;FIELD=…"), and only fields that were on the printed label
  are compared, so editing the template (adding a field, moving things) never makes the
  whole camp "changed". Older one-piece fingerprints are upgraded the first time they're
  found unchanged.
- **new**: campers without the label in divisions where at least half have it (so one
  name tag asked for from a card doesn't make the camp "new").
- Campers with the label still waiting (queued, ready, emailed, under 2 days old) are left
  out: that print shows today's details anyway.

**Print these N** makes one job of just those (it opens on the part-used sheet); **Who?**
lists them; **Not needed** remembers what those labels say now
(`settings.label_updates_dismissed:<template>`) and they come back only if they change
again. Printing from Kinus refreshes the printed labels' fingerprints, since the page is
made at print time with the details as they are then.

### Keeping it working on the day

- Each attempt at making a request's PDF writes when it started into the job
  (`error` = "Kinus started at …", never shown). The print queue retries a request still
  "Preparing" 3 minutes after its attempt started, once (claimed with a conditional
  update, so only one page retries it); one whose retry also hangs is marked failed so the
  office sees it and prints it from Kinus. Outcomes are written only if that attempt still
  owns the request, so a request marked printed or cancelled meanwhile stays that way, and
  printed or cancelled requests can't be resent.
- The PDF has a time budget inside the 60 s a page may run (launch 15 s, page 15 s,
  sizing names 8 s, PDF 15 s; email 15 s). A PDF whose names didn't finish shrinking to
  fit isn't sent: the email links to the queue instead.
- Big requests are made in parts of about 200 tags (whole label sheets), each in its own
  server run: a part is stored (`print-output/<job>-part<n>.pdf`), then the next part is
  started with a signed call to `/api/cron/print-part` (HMAC with the service key over job,
  part, attempt mark and app URL). The last part joins them into one PDF (pdf-lib) and
  sends the email. Each part renews the attempt mark, so a long request that's still
  working isn't retried as stuck. Over 3,000 tags no PDF is made; a PDF over 30 MB is
  linked (download from Kinus) instead of attached.
- While the PDF is being made, the request's page already shows the print preview: the
  office can print from Kinus without waiting.
- The request's page reads only what it needs to count tags per division
  (`loadPrintCampersBrief`); the full records (export columns, contacts, merge fields,
  pictures) are read once, for the printable page itself.
- Background images are in the page once (CSS) however many tags; uploads are up to 4 MB
  (Vercel refuses bigger request bodies).
- Automatic print at first check-in creates the request after the phone has its answer,
  and puts it in the queue as ready, without a PDF or email each; failures are logged.
- Who may open a request (print, mark, cancel, resend, print together): the database
  lets them see it, and every camper on it is in their part of camp, or they asked for it
  (`visibleJobs`, one query for any number of requests).
- Staff without the print area send tags to the office, themselves, or another staff
  member's email only.
- Requests store a "send to" only when someone chose one; otherwise the office address at
  the time it's sent is used (a changed office email applies to waiting requests too).
- Part-used sheet positions are per camp and label stock
  (`settings.label_sheet:<camp>/<stock>`), one row each.

## 6.7 Batch printing (before the program)

`/print/batch`: template, scope (division / bunk / all / only campers without a
printed tag / **new campers and anyone whose details on it changed since it was
printed**), copies, sheet layout → one job → one PDF. Each printed label keeps a
fingerprint of the camper's values for the fields that template uses
(`print_job_items.content_hash`, migration 0019); "changed" compares it with the
camper's values now, so a moved bunk or a corrected name comes up again, while a
check-in or moving parts around on the template doesn't. Labels printed before
0019 count as unchanged. Also "Bunk sheets for division X", and the
Publisher data-source export (6.3 B) from the same screen.

## 6.8 Email (Resend)

- Verified domain (SPF/DKIM); from `tags@<your-domain>` (`EMAIL_FROM`). Without it,
  Resend's test sender (`onboarding@resend.dev`) only delivers to the Resend account's
  own address: Settings warns about this.
- **Settings → Office email → Send a test email** makes a sample tag into a PDF (the
  same way requests are) and emails it to the office, then says what worked or, in
  plain words, what didn't (test mode, unverified domain, bad API key, rate limit).
  The same explanations show on a request that couldn't be emailed, in the print
  queue (`explainEmailError` in `lib/print/email.ts`).
- The request email ("To print: Name tag · … · from …") names the campers (up to 12)
  and who asked, leads with **Open the print queue in Kinus**, and says why printing
  from Kinus beats the attached PDF: everything waiting in one place, same-tag
  requests printed together, part-used label sheets continued, and "printed" showing
  on the camper's card. The PDF stays attached as a fallback.
- Testing against a stand-in: `RESEND_API_URL` replaces `https://api.resend.com`.
- Attachment limit 40 MB covers hundreds of tags; above that the email carries a
  signed Storage link (7 days) and says so.
- React Email templates: `PrintJobEmail`, `StaffInviteEmail`, optional
  `DailySummaryEmail`.
- `email_message_id` recorded per job; Resend webhooks (delivered / bounced)
  update the queue so bounces are visible.
