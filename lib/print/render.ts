import { code128Svg, qrSvg } from "./barcode";
import { embeddedFontCss } from "./fonts";
import { FONTS, fontStack, lineHeightOf } from "./font-families";
import { fill } from "./merge";
import { sheetPlacement, type Layer, type PrintItem, type SheetLayout, type TemplateSpec } from "./types";
import { minPt, PX_PER_PT } from "./render-constants";

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
  if ((l.type === "text" || l.type === "barcode") && l.rotate) {
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
      const style = `${pos}font-size:${l.size}pt;font-weight:${l.weight ?? 400};text-align:${l.align ?? "left"};color:${safeColor(l.color, "#111111")};justify-content:${l.align === "center" ? "center" : l.align === "right" ? "flex-end" : "flex-start"};${l.font && l.font !== "sans" ? `font-family:${fontStack(l.font)};` : ""}line-height:${lineHeightOf(l.font)};${l.italic ? "font-style:italic;" : ""}`;
      const fitAttr = l.fit !== false ? `data-fit data-min="${(minPt(l) * PX_PER_PT).toFixed(2)}"` : "";
      return `<div class="l t${l.wrap ? " wrap" : ""}" ${fitAttr} style="${esc(style)}"><span dir="auto"${l.underline ? ' style="text-decoration:underline"' : ""}>${esc(text)}</span></div>`;
    }
    case "barcode": {
      const text = fill(l.text, get);
      const svg = code128Svg(text).replace("<svg ", '<svg preserveAspectRatio="none" ');
      const label = l.showText !== false ? `<div class="bc-text">${esc(text)}</div>` : "";
      return `<div class="l bc" style="${pos}"><div class="bars">${svg}</div>${label}</div>`;
    }
    case "image":
      // the picture itself is in the page once (CSS class per picture); see renderDocument
      return `<div class="l im ${imageClass(l.path)}" style="${pos}background-size:${l.fit === "cover" ? "cover" : "contain"}"></div>`;
    case "qr": {
      const svg = qrSvg(fill(l.text, get)).replace("<svg ", '<svg preserveAspectRatio="xMidYMid meet" ');
      return `<div class="l qr" style="${pos}">${svg}</div>`;
    }
  }
}

// the background image is in the page once (CSS); each tag only refers to it, so a big image
// doesn't make a 500-tag page hundreds of megabytes
function tagHtml(t: TemplateSpec, values: Record<string, string>, background: string | null): string {
  return `<div class="tag" style="width:${t.page_width_mm}mm;height:${t.page_height_mm}mm;">${background ? `<div class="bg"></div>` : ""}${t.layers.map((l) => (l.hidden ? "" : layerHtml(l, values))).join("")}</div>`;
}

/**
 * One HTML document for a print job: one tag per page (label printers), or tags laid
 * out N-up on letter/A4 sheets. The same HTML is printed by the browser and turned
 * into a PDF by Chromium.
 */
export function renderDocument(
  t: TemplateSpec,
  items: PrintItem[],
  opts: { background?: string | null; outlines?: boolean; skip?: number; usedSlots?: number[]; images?: Record<string, string> } = {},
): string {
  const sheet = t.sheet_layout;
  const per = sheet && sheet.cols > 0 && sheet.rows > 0 ? sheet.cols * sheet.rows : 0;
  // a part-used label sheet: the labels already peeled off stay empty (only on the first sheet).
  // `usedSlots` names them (1-based, anywhere on the sheet); `skip` is "the first n".
  const used = new Set(per ? (opts.usedSlots ?? Array.from({ length: Math.max(0, Math.floor(opts.skip ?? 0)) }, (_, i) => i + 1)).filter((n) => n >= 1 && n <= per) : []);
  if (used.size >= per) used.clear();
  const printed = items.flatMap((it) => Array.from({ length: Math.max(1, it.copies) }, () => tagHtml(t, it.values, opts.background ?? null)));
  // null: a label already used (marked on screen, never printed)
  const tags: (string | null)[] = [];
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
    const dx = sheet.shiftXMm ?? 0;
    const dy = sheet.shiftYMm ?? 0;
    // every label at its exact place on the sheet, as the label maker publishes it
    pageCss = `@page{size:${pw}mm ${ph}mm;margin:0}.sheet{position:relative;width:${pw}mm;height:${ph}mm;overflow:hidden;break-after:page}.sheet>.tag{position:absolute}`;
    const pages: string[] = [];
    for (let i = 0; i < tags.length; i += per) {
      const slots = tags.slice(i, i + per).map((tag, k) => {
        const x = at.left + (k % sheet.cols) * at.pitchX + dx;
        const y = at.top + Math.floor(k / sheet.cols) * at.pitchY + dy;
        // a label already used on the part-used sheet: marked on screen, never printed
        if (tag === null) return `<div class="tag used" style="left:${x.toFixed(2)}mm;top:${y.toFixed(2)}mm;width:${t.page_width_mm}mm;height:${t.page_height_mm}mm;"></div>`;
        return tag.replace('<div class="tag" style="', `<div class="tag" style="left:${x.toFixed(2)}mm;top:${y.toFixed(2)}mm;`);
      });
      pages.push(`<div class="sheet">${slots.join("")}</div>`);
    }
    body = pages.join("");
  } else {
    pageCss = `@page{size:${t.page_width_mm}mm ${t.page_height_mm}mm;margin:0}.tag{break-after:page}`;
    body = tags.join("");
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.name)}</title><style>
${embeddedFontCss(t.layers.flatMap((l) => (l.type === "text" && l.font && !l.hidden ? [FONTS[l.font]?.family ?? "Kinus Sans"] : [])))}
${pageCss}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}
body{font-family:"Kinus Sans","Noto Sans","Noto Sans Hebrew",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.tag{position:relative;overflow:hidden;background:#fff${opts.outlines ? ";outline:0.2mm dashed #cbd5e1" : ""}}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}${opts.background ? `.bg{background-image:url("${opts.background.replace(/"/g, "%22")}")}` : ""}
.im{background-repeat:no-repeat;background-position:center}${Object.entries(opts.images ?? {})
    .map(([path, url]) => `.${imageClass(path)}{background-image:url("${url.replace(/"/g, "%22")}")}`)
    .join("")}
.l{position:absolute;overflow:hidden}
.t{display:flex;align-items:center;white-space:nowrap}
.t span{max-width:100%;overflow:hidden;text-overflow:clip;unicode-bidi:plaintext}
.t.wrap{white-space:normal;align-items:flex-start}
.bc{display:flex;flex-direction:column;background:#fff}.bc .bars{flex:1;min-height:0}.bc svg{width:100%;height:100%;display:block}
.bc-text{font-size:7pt;text-align:center;letter-spacing:0.5pt;line-height:1.2;padding-top:0.4mm}
.qr svg{width:100%;height:100%;display:block}
@media screen{body{background:#e2e8f0;padding:8mm;display:flex;flex-wrap:wrap;gap:6mm;align-items:flex-start}.tag,.sheet{flex-shrink:0;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)}}
.used{background:repeating-linear-gradient(45deg,#f1f5f9 0 2mm,#fff 2mm 4mm);outline:0.3mm dashed #94a3b8}
@media print{body{display:block}.used{display:none}}
</style></head><body>${body}<script>
(function(){function fit(){document.querySelectorAll("[data-fit]").forEach(function(el){var span=el.firstElementChild;var min=parseFloat(el.getAttribute("data-min"))||8;var s=parseFloat(getComputedStyle(el).fontSize);var over=function(){return span.scrollWidth>el.clientWidth+0.5||el.scrollHeight>el.clientHeight+0.5};if(!over())return;var r=Math.min(el.clientWidth/Math.max(span.scrollWidth,1),el.clientHeight/Math.max(el.scrollHeight,1));s=Math.max(min,Math.floor(s*Math.min(1,r)*2)/2);el.style.fontSize=s+"px";var guard=80;while(guard-->0&&s>min&&over()){s=Math.max(min,s-0.5);el.style.fontSize=s+"px";}});document.body.setAttribute("data-fitted","1");}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit)}else{window.addEventListener("load",fit)}})();
</script></body></html>`;
}
