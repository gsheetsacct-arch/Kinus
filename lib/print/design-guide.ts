/** What the design connector tells Claude about Kinus templates (lib/print/design-mcp). */
export const DESIGN_GUIDE = `# Designing Kinus templates

Kinus prints name tags, luggage tags and labels for camp: one tag per camper, filled with each
camper's details, and staff tags (one per staff member, filled from the staff list). A template is JSON; you change it with save_template and look at it with
preview_template (a picture exactly as it prints) and check_fit (every real camper).

## Workflow
1. list_templates, then get_template to start from an existing one (or build a new one).
2. list_fields for what can go on a tag, list_fonts, list_label_stock for the paper.
3. Edit the JSON. Keep each part's "id" when changing it; new parts need a new short id.
4. preview_template with the draft (template: {...}) before saving; camper "longest" shows the
   longest real text on each part. check_fit shows how every camper fits.
5. save_template. It's live for printing at once, so preview first.

## The template
{ "id"?: uuid (omit to create), "name", "kind": "name_tag"|"luggage_tag"|"other",
  "page_width_mm", "page_height_mm",            // the tag (label) size
  "sheet_layout": null | {...}                    // null: one tag per page (label printer);
                                                  // a sheet: copy "sheet" from list_label_stock
  "back": null | {"flip": "long"|"short"},       // two-sided: parts with "side":"back" print behind
  "audience": "campers" | "staff",              // whose tag (default campers); staff tags print from Print → Staff tags
  "thermal": bool,                                // for a thermal label printer: black and white only, a page per label
  "camps": [] | ["American", ...],               // only for these camps; [] every camp (campers only)
  "show_on_card": bool, "auto_on_first_checkin": bool, "copies": 1-10,
  "layers": [ part, ... ] }                       // drawn in order: later parts on top

Positions are millimetres from the tag's top-left: x, y, w (width), h (height).

## Parts
- text: {"type":"text","id","text","x","y","w","h","size": pt,"weight":400|700,
  "align":"left"|"center"|"right","color":"#hex","font","italic","underline",
  "fit": true (shrink long text to fit; default), "minSize": pt (the smallest it shrinks to
  normally; very long names still go smaller, down to 4 pt, to print whole), "wrap": bool
  (more than one line), "valign": "top"|"middle"|"bottom" (where the text sits in its box;
  middle by default, top when it wraps), "lineHeight": number (line spacing × the size for
  wrapped text; default the font's own, 1.4 for uploaded fonts: lower it for snug lines,
  e.g. 1.2; the tails of g, j, p, q and y hang past the line and print whole), "curve": "top"|"bottom" (the text runs along the
  top or bottom of the circle inside its box, letters upright, centred, shrinking to fit the
  arc: for round stickers make the box the sticker's size), "arc": degrees of the circle it may
  take (default 180), "letterSpacing": em (extra space between letters, × the size; e.g. 0.05
  for airy capitals, negative to tighten), "wordSpacing": em (extra space between words),
  "rotate": 0|90|-90}
  A name that should wrap only when it's very long: "wrap": true, "valign": "bottom", and a box
  tall enough for two lines that ends where one line ends. A short name sits where it always
  did; a name that fits on one line by shrinking a little stays on one line, and only a long
  one wraps into two balanced lines growing upwards.
  "text" mixes words and fields: "{{FIRST}} {{LAST}}", "Bunk {{BUNK}}". "{{A|B}}" is A, or B
  when A is empty. A text whose fields are all empty for a camper doesn't print.
- barcode: {"type":"barcode","id","text":"{{BARCODE}}","x","y","w","h","showText":bool,"color":"#hex"}
  Keep it dark and wide enough (Kinus checks scanning in the editor); quiet space is built in.
- qr: {"type":"qr","id","text","x","y","w","h","color":"#hex","shape":"square"|"round"} (w = h;
  "round": the code in a circle of made-up squares, on a white disc, as on restaurant pagers;
  it scans the same)
- box: {"type":"box","id","x","y","w","h","fill":"#hex"|"{{DIVISION_COLOR}}","radius": mm,"border":"#hex"}
  A colour block (strips, backgrounds); "{{DIVISION_COLOR}}" is each camper's division colour.
- image: {"type":"image","id","path","x","y","w","h","fit":"contain"|"cover","pdf"?: {...},
  "byDivision": {"Division 2": "pictures/..", "Hebrew Division": ""}} (another picture, or
  none "", for a division). Upload the picture first: upload_picture gives the path.
  A PDF uploaded with upload_picture comes back as image parts with "pdf": keep it. The PDFs
  Kinus prints draw that PDF page itself (sharp), under the tag's other parts; the screen and
  previews show a picture of it.
Every part may also have "locked", "hidden", and "side":"back" (on a two-sided template).

## Staff tags
A template with "audience": "staff" is filled from the staff list: list_fields and longest_values
with for "staff" show what it can say ({{FIRST}}, {{LAST}}, {{FULL}}, {{HEBREW_NAME}},
{{POSITION}}, {{ROLE}}, {{DIVISION}}, {{BUNK}}, {{CAMP}}, {{DIVISION_COLOR}}, {{PHONE}}…).
preview_template and check_fit use staff for it ("camper" may be a staff member's name). To
turn a camper design into a staff one, copy_template with for "staff" (the camper one stays),
then change the parts that say camper things (a camper's QR code means nothing on a staff tag).
Staff tags have no camps, card button or check-in printing.

## Thermal label printers
Zebra, Rollo and other thermal printers print black only: a colour or grey comes out speckled.
"thermal": true prints every colour as solid black or white (whichever it's closer to), codes
black and pictures black and white; preview_template shows it so. Design for it: black text, solid
black bands with white text, no pale tints. The Zebra 4×6 (list_label_stock "4×6") is 101.6 mm
wide and 152.4 mm tall as it comes out of the printer: design it that way up (or 152.4 × 101.6 and
Kinus turns each label onto a 4″ × 6″ page). A QR code of {{BARCODE}} at least 25 mm wide scans
well on a 203 dpi printer.

## Fonts and colours
"font" is "sans" (default), "rounded", "serif", "display", or an uploaded one "custom:<id>"
(list_fonts; upload_font adds the designer's own). Every font prints with Hebrew and French
letters (missing letters fall back to Kinus Sans). Colours are #rrggbb.
States and countries print the same way everywhere: a state or country column ({{family.state}},
a field made from it, a staff tag's {{STATE}}) prints as its code, NY, and the US as USA.

## Design around the text
Names vary a lot in length (and Hebrew names are on many tags). Before sizing parts, run
longest_values: the widest real value of each field (first names, last names, bunks, Hebrew
names…) and how many campers have it. Give each part room for those, set "size" for an
ordinary value and "minSize" for the smallest you'd accept. Then check:
- preview_template camper "worst": every field at once with its longest value. If it fits, every
  camper fits.
- preview_template camper "longest": the real camper whose text is longest on this tag.
- check_fit: every camper; lists who went under minSize or didn't fit at all. A background picture (a full-tag design from InDesign, exported as PNG at
300 dpi, without the names) goes in with upload_picture use "background".`;
