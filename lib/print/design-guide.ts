/** What the design connector tells Claude about Kinus templates (lib/print/design-mcp). */
export const DESIGN_GUIDE = `# Designing Kinus templates

Kinus prints name tags, luggage tags and labels for camp: one tag per camper, filled with each
camper's details. A template is JSON; you change it with save_template and look at it with
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
  "camps": [] | ["American", ...],               // only for these camps; [] every camp
  "show_on_card": bool, "auto_on_first_checkin": bool, "copies": 1-10,
  "layers": [ part, ... ] }                       // drawn in order: later parts on top

Positions are millimetres from the tag's top-left: x, y, w (width), h (height).

## Parts
- text: {"type":"text","id","text","x","y","w","h","size": pt,"weight":400|700,
  "align":"left"|"center"|"right","color":"#hex","font","italic","underline",
  "fit": true (shrink long text to fit; default), "minSize": pt (the smallest it shrinks to
  normally; very long names still go smaller, down to 4 pt, to print whole), "wrap": bool
  (more than one line), "rotate": 0|90|-90}
  "text" mixes words and fields: "{{FIRST}} {{LAST}}", "Bunk {{BUNK}}". "{{A|B}}" is A, or B
  when A is empty. A text whose fields are all empty for a camper doesn't print.
- barcode: {"type":"barcode","id","text":"{{BARCODE}}","x","y","w","h","showText":bool,"color":"#hex"}
  Keep it dark and wide enough (Kinus checks scanning in the editor); quiet space is built in.
- qr: {"type":"qr","id","text","x","y","w","h","color":"#hex"} (square: w = h)
- box: {"type":"box","id","x","y","w","h","fill":"#hex"|"{{DIVISION_COLOR}}","radius": mm,"border":"#hex"}
  A colour block (strips, backgrounds); "{{DIVISION_COLOR}}" is each camper's division colour.
- image: {"type":"image","id","path","x","y","w","h","fit":"contain"|"cover",
  "byDivision": {"Division 2": "pictures/..", "Hebrew Division": ""}} (another picture, or
  none "", for a division). Upload the picture first: upload_picture gives the path.
Every part may also have "locked", "hidden", and "side":"back" (on a two-sided template).

## Fonts and colours
"font" is "sans" (default), "rounded", "serif", "display", or an uploaded one "custom:<id>"
(list_fonts; upload_font adds the designer's own). Every font prints with Hebrew and French
letters (missing letters fall back to Kinus Sans). Colours are #rrggbb.

## Design around the text
Names vary a lot in length (and Hebrew names are on many tags). Give names the widest box the
design allows, set "size" for an ordinary name and "minSize" for the smallest you'd accept,
and check with preview_template camper "longest" and check_fit: it lists names that went under
minSize or were cut. A background picture (a full-tag design from InDesign, exported as PNG at
300 dpi, without the names) goes in with upload_picture use "background".`;
