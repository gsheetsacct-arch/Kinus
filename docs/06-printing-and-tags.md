# 6. Tags, mail merge and printing

## 6.1 What gets printed

| Kind | Content | Barcode | Typical use |
|---|---|---|---|
| Name tag | First name large, last name, division colour band, bunk, `camper_code` | Code 128 (`KN100016`) + small QR | Worn; scanned at check-in/out |
| Luggage tag | Full name, division, bunk, camper code, local address line (optional), office phone | Code 128 | Tied to luggage |
| Bunk sheet | Per bunk, one page: names + barcodes grid | Code 128 per row | Counselor's paper backup for scanning |

Templates are designed once (your image template is the background), then every tag
is a merge of camper fields into that template.

## 6.2 Template model

A `print_templates` row:

```json
{
  "kind": "name_tag",
  "page_width_mm": 90, "page_height_mm": 55,
  "background_path": "templates/<id>/bg.png",
  "layers": [
    { "type": "text", "field": "first_name", "x": 8, "y": 14, "w": 74, "h": 14,
      "font": "Noto Sans Hebrew", "size": 22, "weight": 700, "align": "center",
      "fit": "shrink", "dir": "auto", "color": "#111111" },
    { "type": "text", "field": "last_name", "x": 8, "y": 28, "w": 74, "h": 8, "size": 12, "align": "center" },
    { "type": "text", "template": "{{division.name}} · {{bunk.name}}", "x": 8, "y": 38, "w": 74, "h": 6, "size": 9 },
    { "type": "rect", "x": 0, "y": 0, "w": 6, "h": 55, "fill": "{{division.color}}" },
    { "type": "barcode", "symbology": "code128", "value": "KN{{camper_code}}",
      "x": 20, "y": 44, "w": 50, "h": 8, "text": true },
    { "type": "qr", "value": "KN{{camper_code}}", "x": 76, "y": 40, "w": 12, "h": 12 }
  ],
  "sheet_layout": { "paper": "letter", "cols": 2, "rows": 5, "marginMm": 10, "gapMm": 3 }
}
```

- Units are millimetres so a template matches the physical label.
- `fit: "shrink"` reduces font size until the text fits its box: long French
  double-barrelled names and short Hebrew names both look right.
- `dir: "auto"` lets a Hebrew name render RTL inside an otherwise LTR tag.
- Per-division templates override the default (different background colour, Hebrew
  font) by setting `division_id`.
- `sheet_layout` is optional: with it, batches are imposed N-up on letter/A4 sheets
  (Avery-style); without it, one tag per page for a label printer.

## 6.3 Template editor (admin)

Phase 1: a form-based editor — upload background, set size, a list of layers with
numeric fields, and a **live preview** rendered from the same HTML renderer with a
sample camper (pick any camper, including a long Hebrew name and a long French
name). Phase 2 (optional): drag-to-position on the preview.

## 6.4 Rendering pipeline

```
template + camper(s) ─► HTML (React, print CSS, mm units, embedded fonts, SVG barcodes)
                     ─► headless Chromium (puppeteer-core + @sparticuz/chromium) ─► PDF
                     ─► Storage: print-output/<job_id>.pdf
```

- Route handler `POST /api/print/render` (Node runtime, `maxDuration` 60 s). One
  Chromium launch per job; a job with 300 tags renders in a few seconds.
- Barcodes via `bwip-js` as inline SVG (crisp at any DPI, no font dependency).
- Fonts: Noto Sans + Noto Sans Hebrew bundled in the repo and referenced with
  `@font-face` from the HTML; the PDF embeds them.
- The identical HTML is served at `GET /print/jobs/<id>/preview` so the office can
  also just hit **Print** in the browser (`@page { size: 90mm 55mm }`). This is the
  zero-dependency fallback if server rendering ever fails.
- Cold start on Vercel for Chromium is ~2–4 s; acceptable for an on-demand tag.
  Batches run through the queue (below) so the UI never waits on them.

## 6.5 On-demand request from check-in

1. Staff taps **Request tag** on the camper card. Default kind = name tag; the caret
   offers *luggage tag* / *both* / *copies*.
2. Destination email defaults to `settings.office_email.to`; a small "Send to…" link
   lets the user change it **for this request only** (fallback when the office
   printer moves). The last override is remembered on that device as a suggestion.
3. Server action creates `print_jobs` (`status = queued`) + `print_job_items`, then
   immediately calls the worker (`/api/cron/print-jobs?job=<id>`); Vercel Cron also
   sweeps the queue every minute as a safety net.
4. Worker: `rendering` → PDF to Storage → Resend email with the PDF attached
   (subject `Name tag · מנחם כהן · Bunk א · req. by Shmuli`, body with a link to the
   job page) → `sent`. Failure → `failed` with the error; the requester sees a red
   badge on the card and can retry.
5. The office **Print queue** page (`/print`) lists jobs in realtime: who, what, for
   whom, status, **Open PDF**, **Mark printed**, **Re-send**. Marking printed
   closes the loop; the requester's camper card shows "Tag printed 9:40".

## 6.6 Batch printing (before the program)

`/print/batch`: choose kind, template, scope (division / bunk / all / only campers
without a printed tag / only campers whose name changed since last print), copies,
sheet layout → one job → one PDF. Also "Bunk sheets for division X".

## 6.7 Email (Resend)

- Domain verified in Resend (SPF/DKIM); from `tags@<your-domain>`.
- Attachment limit 40 MB covers hundreds of tags; above that the email carries only
  a signed Storage link (valid 7 days) and says so.
- React Email templates in `emails/`: `PrintJobEmail`, `StaffInviteEmail`,
  optional `DailySummaryEmail` (counts per division, sent to directors at a set time).
- Every send records `email_message_id` on the job; Resend webhooks (delivered /
  bounced) update a `delivery` field so the queue shows bounces.
