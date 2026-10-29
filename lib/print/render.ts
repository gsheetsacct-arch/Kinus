import { code128Svg, qrRoundSvg, qrSvg } from "./barcode";
import { tintCode } from "./code-color";
import { embeddedFontCss } from "./fonts";
import { FONTS, fontStack, isCustomFont, lineHeightOf, type FontKey } from "./font-families";
import { fill } from "./merge";
import { DIVISION_VALUE, onBack, pictureFor, sheetPlacement, textAlignItems, textSpacingCss, type Layer, type PrintItem, type SheetLayout, type TemplateSpec } from "./types";
import { FLOOR_PT, minPt, PX_PER_PT } from "./render-constants";
import { isRoundLabel } from "./presets";
import { CURVE_SCALE, curvePath, DEFAULT_ARC } from "./curve";
import { THERMAL_PICTURE_CSS, thermalLayers, thermalValues, turnsOnPage } from "./thermal";

/** A CSS class for a stored picture (the same path always gets the same class). */
export function imageClass(path: string): string {
  let h = 5381;
  for (let i = 0; i < path.length; i++) h = ((h * 33) ^ path.charCodeAt(i)) >>> 0;
  return `im-${h.toString(36)}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PAPER: Record<SheetLayout["paper"], [number, number]> = { letter: [215.9, 279.4], a4: [210, 297] };
const safeColor = (c: string | undefined, fallback: string) => (c && /^#[0-9a-f]{3,8}$|^[a-z]+$/i.test(c.trim()) ? c.trim() : fallback);

/**
 * One part of a tag. A turned part (rotate ±90) keeps its box (x, y, w, h) as seen on the
 * tag; its content is laid out across the turned box and then rotated into place.
 */
function layerHtml(l: Layer, values: Record<string, string>, at?: string): string {
  const get = (k: string) => values[k] ?? "";
  if ((l.type === "text" || l.type === "barcode") && l.rotate && !(l.type === "text" && l.curve)) {
    const inner = `left:50%;top:50%;width:${l.h}mm;height:${l.w}mm;transform:translate(-50%,-50%) rotate(${l.rotate}deg);`;
    return `<div class="l" style="left:${l.x}mm;top:${l.y}mm;width:${l.w}mm;height:${l.h}mm;overflow:visible">${layerHtml({ ...l, rotate: 0, w: l.h, h: l.w }, values, inner)}</div>`;
  }
  const pos = at ?? `left:${l.x}mm;top:${l.y}mm;width:${l.w}mm;height:${l.h}mm;`;
  switch (l.type) {
    case "box": {
      const color = safeColor(fill(l.fill ?? "", get), "transparent");
      return `<div class="l" style="${pos}background:${color};border-radius:${l.radius ?? 0}mm;${l.border ? `border:0.3mm solid ${safeColor(l.border, "#000")};` : ""}"></div>`;
    }
    case "text": {
      // "T-shirt: {{TSHIRT}}" with no T-shirt size prints nothing, not a lonely "T-shirt:"
      const fields = [...l.text.matchAll(/\{\{[^{}]+\}\}/g)];
      if (fields.length && fields.every((m) => fill(m[0], get).trim() === "")) return "";
      const text = fill(l.text, get);
      if (l.curve) return curvedHtml(l, text, pos);
      const style = `${pos}font-size:${l.size}pt;font-weight:${l.weight ?? 400};text-align:${l.align ?? "left"};color:${safeColor(l.color, "#111111")};justify-content:${l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start"};align-items:${textAlignItems(l)};${textSpacingCss(l)}${l.font && l.font !== "sans" ? `font-family:${fontStack(l.font)};` : ""}line-height:${l.lineHeight ?? lineHeightOf(l.font)};${l.italic ? "font-style:italic;" : ""}`;
      const fitAttr = l.fit !== false ? `data-fit data-min="${(minPt(l) * PX_PER_PT).toFixed(2)}" data-floor="${(Math.min(FLOOR_PT, minPt(l)) * PX_PER_PT).toFixed(2)}"` : "";
      return `<div class="l t${l.wrap ? " wrap" : ""}" data-part="${esc(l.id)}" ${fitAttr} style="${esc(style)}"><span dir="auto"${l.underline ? ' style="text-decoration:underline"' : ""}>${esc(text)}</span></div>`;
    }
    case "barcode": {
      const text = fill(l.text, get);
      const svg = tintCode(code128Svg(text), l.color).replace("<svg ", '<svg preserveAspectRatio="none" ');
      const label = l.showText !== false ? `<div class="bc-text"${l.color ? ` style="color:${safeColor(l.color, "#000")}"` : ""}>${esc(text)}</div>` : "";
      return `<div class="l bc" style="${pos}"><div class="bars">${svg}</div>${label}</div>`;
    }
    case "image": {
      // the picture itself is in the page once (CSS class per picture); see renderDocument
      const path = pictureFor(l, values[DIVISION_VALUE]);
      if (!path) return "";
      // drawn from an uploaded PDF: the PDFs Kinus makes put the PDF page itself here (lib/print/pdf)
      const pdf = l.pdf && path === l.path ? ` data-pdf="${esc(l.pdf.path)}" data-pdf-page="${l.pdf.page}" data-pdf-box="${l.pdf.box.join(",")}" data-pdf-fit="${l.fit === "cover" ? "cover" : "contain"}"` : "";
      return `<div class="l im ${imageClass(path)}"${pdf} style="${pos}background-size:${l.fit === "cover" ? "cover" : "contain"}"></div>`;
    }
    case "qr": {
      const code = l.shape === "round" ? qrRoundSvg(fill(l.text, get)) : qrSvg(fill(l.text, get));
      const svg = tintCode(code, l.color).replace("<svg ", '<svg preserveAspectRatio="xMidYMid meet" ');
      return `<div class="l qr" style="${pos}">${svg}</div>`;
    }
  }
}

let curveIds = 0;
const MM_PER_PT = 25.4 / 72;

/**
 * Text along the top or bottom of the circle in its box (lib/print/curve): an SVG drawing in
 * mm. The page's script shrinks it to fit its arc, as straight text is shrunk to fit its box.
 */
function curvedHtml(l: Extract<Layer, { type: "text" }>, text: string, pos: string): string {
  const size = l.size * MM_PER_PT;
  const arc = l.arc ?? DEFAULT_ARC;
  const id = `kc${++curveIds}`;
  const fitAttr = l.fit !== false ? ` data-fit data-minmm="${(minPt(l) * MM_PER_PT).toFixed(3)}" data-floormm="${(Math.min(FLOOR_PT, minPt(l)) * MM_PER_PT).toFixed(3)}"` : "";
  const font = l.font && l.font !== "sans" ? ` font-family="${esc(fontStack(l.font))}"` : "";
  return `<div class="l tc" data-part="${esc(l.id)}"${fitAttr} data-curve="${l.curve}" data-arc="${arc}" data-w="${l.w}" data-h="${l.h}" data-size="${size.toFixed(3)}" style="${pos}font-size:${l.size}pt;overflow:visible"><svg viewBox="0 0 ${l.w * CURVE_SCALE} ${l.h * CURVE_SCALE}" width="100%" height="100%"><path id="${id}" d="${curvePath(l.w, l.h, l.curve!, arc, size).d}" fill="none"/><text font-size="${(size * CURVE_SCALE).toFixed(1)}" font-weight="${l.weight ?? 400}"${font}${l.italic ? ' font-style="italic"' : ""}${l.underline ? ' text-decoration="underline"' : ""} fill="${esc(safeColor(l.color, "#111111"))}"${textSpacingCss(l) ? ` style="${textSpacingCss(l)}"` : ""} text-anchor="middle" dominant-baseline="central"><textPath href="#${id}" startOffset="50%">${esc(text)}</textPath></text></svg></div>`;
}

// the background image is in the page once (CSS); each tag only refers to it, so a big image
// doesn't make a 500-tag page hundreds of megabytes
// (two-sided: the front's parts, or the back's; the background image is on the front)
function tagHtml(t: TemplateSpec, values: Record<string, string>, background: string | null, side: "front" | "back" = "front"): string {
  const parts = t.layers.filter((l) => !l.hidden && onBack(l) === (side === "back"));
  return `<div class="tag${side === "back" ? " back" : ""}" style="width:${t.page_width_mm}mm;height:${t.page_height_mm}mm;">${background && side === "front" ? `<div class="bg"></div>` : ""}${parts.map((l) => layerHtml(l, values)).join("")}</div>`;
}

/**
 * The tags of one sheet (in reading order, null = a used label) moved so that consecutive
 * tags run down a column, `stack` rows at a time: with 2 copies each, A sits over A and B
 * over B beside it. The same labels are filled (the sheet the office keeps track of stays
 * right); only which tag goes on which label changes. stack 1: unchanged. When the copies fill
 * whole rows (3 copies on a 3-across sheet), they go across a row instead, as they're read.
 */
export function stackColumns<T>(slots: (T | null)[], cols: number, stack: number): (T | null)[] {
  if (stack <= 1 || cols <= 1 || cols % stack === 0) return slots;
  const filled = slots.map((t, k) => (t === null ? -1 : k)).filter((k) => k >= 0);
  const order = [...filled].sort((a, b) => {
    const [ra, rb] = [Math.floor(a / cols), Math.floor(b / cols)];
    return Math.floor(ra / stack) - Math.floor(rb / stack) || (a % cols) - (b % cols) || ra - rb;
  });
  const out = slots.slice();
  order.forEach((k, j) => (out[k] = slots[filled[j]]));
  return out;
}

/**
 * One HTML document for a print job: one tag per page (label printers), or tags laid
 * out N-up on letter/A4 sheets. The same HTML is printed by the browser and turned
 * into a PDF by Chromium.
 */
export function renderDocument(
  spec: TemplateSpec,
  given: PrintItem[],
  opts: { background?: string | null; outlines?: boolean; skip?: number; usedSlots?: number[]; images?: Record<string, string>; stack?: number; /** @font-face rules for the template's uploaded fonts (customFontCss). */ fontCss?: string } = {},
): string {
  // a thermal printer: black and white only (lib/print/thermal)
  const t = spec.thermal ? { ...spec, layers: thermalLayers(spec.layers) } : spec;
  const items = spec.thermal ? thermalValues(given) : given;
  const sheet = t.sheet_layout;
  const per = sheet && sheet.cols > 0 && sheet.rows > 0 ? sheet.cols * sheet.rows : 0;
  // a part-used label sheet: the labels already peeled off stay empty (only on the first sheet).
  // `usedSlots` names them (1-based, anywhere on the sheet); `skip` is "the first n".
  const used = new Set(per ? (opts.usedSlots ?? Array.from({ length: Math.max(0, Math.floor(opts.skip ?? 0)) }, (_, i) => i + 1)).filter((n) => n >= 1 && n <= per) : []);
  if (used.size >= per) used.clear();
  const back = t.back ?? null;
  const front = (values: Record<string, string>) => tagHtml(t, values, opts.background ?? null);
  const printed = items.flatMap((it) => Array.from({ length: Math.max(1, it.copies) }, () => it.values));
  // null: a label already used (marked on screen, never printed)
  const tags: (Record<string, string> | null)[] = [];
  if (used.size) {
    for (let slot = 1; slot <= per && printed.length; slot++) tags.push(used.has(slot) ? null : printed.shift()!);
    // later sheets are filled from the top
    while (printed.length && tags.length % per) tags.push(null);
  }
  tags.push(...printed);
  let pageCss: string;
  let body: string;
  if (sheet && sheet.cols > 0 && sheet.rows > 0) {
    const [pw, ph] = PAPER[sheet.paper] ?? PAPER.letter;
    const per = sheet.cols * sheet.rows;
    const at = sheetPlacement(sheet, t.page_width_mm, t.page_height_mm, pw);
    const [w, h] = [t.page_width_mm, t.page_height_mm];
    const place = (html: string, x: number, y: number) => html.replace(/^<div class="(tag[^"]*)" style="/, `<div class="$1" style="left:${x.toFixed(2)}mm;top:${y.toFixed(2)}mm;`);
    // every label at its exact place on the sheet, as the label maker publishes it
    pageCss = `@page{size:${pw}mm ${ph}mm;margin:0}.sheet{position:relative;width:${pw}mm;height:${ph}mm;overflow:hidden;break-after:page}.sheet>.tag{position:absolute}`;
    const pages: string[] = [];
    // copies of one camper go down a column (bands of `stack` rows), unless they fill whole rows
    const stack = Math.min(sheet.rows, Math.max(1, Math.round(opts.stack ?? Math.max(1, ...items.map((it) => it.copies)))));
    for (let i = 0; i < tags.length; i += per) {
      const slots = stackColumns(tags.slice(i, i + per), sheet.cols, stack);
      const spot = (k: number) => ({ x: at.left + (k % sheet.cols) * at.pitchX, y: at.top + Math.floor(k / sheet.cols) * at.pitchY });
      const fronts = slots.map((v, k) => {
        const { x, y } = spot(k);
        const [fx, fy] = [x + (sheet.shiftXMm ?? 0), y + (sheet.shiftYMm ?? 0)];
        // a label already used on the part-used sheet: marked on screen, never printed
        if (v === null) return `<div class="tag used" style="left:${fx.toFixed(2)}mm;top:${fy.toFixed(2)}mm;width:${w}mm;height:${h}mm;"></div>`;
        return place(front(v), fx, fy);
      });
      pages.push(`<div class="sheet">${fronts.join("")}</div>`);
      if (back) {
        // the back of the sheet: each tag's back behind its front, as the paper turns over
        // (long edge: left and right swap; short edge: top and bottom swap)
        const backs = slots.map((v, k) => {
          if (v === null) return "";
          const { x, y } = spot(k);
          const bx = (back.flip === "short" ? x : pw - x - w) + (back.shiftXMm ?? 0);
          const by = (back.flip === "short" ? ph - y - h : y) + (back.shiftYMm ?? 0);
          return place(tagHtml(t, v, null, "back"), bx, by);
        });
        pages.push(`<div class="sheet back">${backs.join("")}</div>`);
      }
    }
    body = pages.join("");
  } else if (turnsOnPage(t)) {
    // a label printer fed the narrow way (a 6″ × 4″ design on 4″ × 6″ labels): each page is the
    // label as the printer feeds it, with the design turned a quarter onto it
    const [w, h] = [t.page_width_mm, t.page_height_mm];
    pageCss = `@page{size:${h}mm ${w}mm;margin:0}.pg{position:relative;width:${h}mm;height:${w}mm;overflow:hidden;break-after:page}.pg>.tag{position:absolute;left:0;top:0;transform-origin:0 0;transform:translateX(${h}mm) rotate(90deg)}`;
    const page = (html: string) => `<div class="pg">${html}</div>`;
    body = tags.map((v) => (v ? page(front(v)) + (back ? page(tagHtml(t, v, null, "back")) : "") : "")).join("");
  } else {
    pageCss = `@page{size:${t.page_width_mm}mm ${t.page_height_mm}mm;margin:0}.tag{break-after:page}`;
    // one tag a page: front, then its back on the next page (the back of the same label)
    body = tags.map((v) => (v ? front(v) + (back ? tagHtml(t, v, null, "back") : "") : "")).join("");
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.name)}</title><style>
${embeddedFontCss(t.layers.flatMap((l) => (l.type === "text" && l.font && !l.hidden && !isCustomFont(l.font) ? [FONTS[l.font as FontKey]?.family ?? "Kinus Sans"] : [])))}${opts.fontCss ?? ""}
${pageCss}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}
body{font-family:"Kinus Sans","Noto Sans","Noto Sans Hebrew",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.tag{position:relative;overflow:hidden;background:#fff${opts.outlines ? ";outline:0.2mm dashed #cbd5e1" : ""}}${isRoundLabel(t.page_width_mm, t.page_height_mm, t.sheet_layout) ? ".tag{border-radius:50%}" : ""}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}${opts.background ? `.bg{background-image:url("${opts.background.replace(/"/g, "%22")}")}` : ""}
.im{background-repeat:no-repeat;background-position:center}${Object.entries(opts.images ?? {})
    .map(([path, url]) => `.${imageClass(path)}{background-image:url("${url.replace(/"/g, "%22")}")}`)
    .join("")}
.l{position:absolute;overflow:hidden}
.t{display:flex;align-items:center;white-space:nowrap}
.t span{max-width:100%;overflow:hidden;text-overflow:clip;unicode-bidi:plaintext}
.tc svg{display:block;overflow:visible}.t.wrap{white-space:normal;align-items:flex-start}.t.wrap span{text-wrap:balance}
.bc{display:flex;flex-direction:column;background:#fff}.bc .bars{flex:1;min-height:0}.bc svg{width:100%;height:100%;display:block}
.bc-text{font-size:7pt;text-align:center;letter-spacing:0.5pt;line-height:1.2;padding-top:0.4mm}
.qr svg{width:100%;height:100%;display:block}
@media screen{body{background:#e2e8f0;padding:8mm;display:flex;flex-wrap:wrap;gap:6mm;align-items:flex-start}.tag,.sheet,.pg{flex-shrink:0;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)}.pg>.tag{box-shadow:none}}${t.thermal ? `\n${THERMAL_PICTURE_CSS}` : ""}
.used{background:repeating-linear-gradient(45deg,#f1f5f9 0 2mm,#fff 2mm 4mm);outline:0.3mm dashed #94a3b8}
@media screen{.sheet.back,.tag.back:not(.sheet>.tag){outline:0.6mm dashed #94a3b8}.sheet.back::before,body>.tag.back::after{content:"Back";position:absolute;top:1mm;right:1mm;z-index:5;font:600 8pt sans-serif;color:#475569;background:#f1f5f9;padding:0.3mm 1.5mm;border-radius:1mm}}
@media print{body{display:block}.used{display:none}}
</style></head><body>${body}<script>
(function(){${CURVE_SCRIPT}function fit(){document.querySelectorAll("[data-fit]:not(.tc)").forEach(function(el){var span=el.firstElementChild;var min=parseFloat(el.getAttribute("data-min"))||8;var floor=parseFloat(el.getAttribute("data-floor"))||min;var s=parseFloat(getComputedStyle(el).fontSize);var over=function(){return span.scrollWidth>el.clientWidth+0.5||el.scrollHeight>el.clientHeight+0.5};if(!over())return;var r=Math.min(el.clientWidth/Math.max(span.scrollWidth,1),el.clientHeight/Math.max(el.scrollHeight,1));/* text on more lines steps down from its size: a jump would skip the sizes where it fits on fewer lines */if(getComputedStyle(el).whiteSpace!=="nowrap")r=1;s=Math.max(min,Math.floor(s*Math.min(1,r)*2)/2);el.style.fontSize=s+"px";var guard=80;while(guard-->0&&s>min&&over()){s=Math.max(min,s-0.5);el.style.fontSize=s+"px";}
/* a name too long even at the smallest size goes smaller, so it prints whole: marked for the office */
guard=400;while(guard-->0&&s>floor&&over()){s=Math.max(floor,s-0.5);el.style.fontSize=s+"px";}if(s<min)el.setAttribute("data-small",(Math.round(s*0.75*2)/2).toString());if(over())el.setAttribute("data-cut","1");});fitCurves();document.body.setAttribute("data-fitted","1");}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit)}else{window.addEventListener("load",fit)}})();
</script></body></html>`;
}

/**
 * The page's curved-text fitting: curvePath's own code, and fitCurve's steps (lib/print/curve).
 * Shrinks each curved text until it fits its arc; marks the ones under their smallest size.
 */
const CURVE_SCRIPT = `var curvePath=(${curvePath.toString()});function fitCurves(){document.querySelectorAll(".tc[data-fit]").forEach(function(el){var t=el.querySelector("text"),p=el.querySelector("path");if(!t||!p)return;var d=el.dataset,w=+d.w,h=+d.h,arc=+d.arc,s=+d.size,min=+d.minmm,floor=+d.floormm,len=0;function set(v){var g=curvePath(w,h,d.curve,arc,v);p.setAttribute("d",g.d);t.setAttribute("font-size",(v*${CURVE_SCALE}).toFixed(1));len=g.length}function over(){return t.getComputedTextLength()>len+1}set(s);for(var i=0;i<200&&s>min&&over();i++){s=Math.max(min,s*0.97);set(s)}for(i=0;i<200&&s>floor&&over();i++){s=Math.max(floor,s*0.97);set(s)}el.style.fontSize=(s/${MM_PER_PT})+"pt";if(s<min-1e-6)el.setAttribute("data-small",(Math.round(s/${MM_PER_PT}*2)/2).toString());if(over())el.setAttribute("data-cut","1")})}`;
