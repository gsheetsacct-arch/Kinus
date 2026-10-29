import type { Layer, PrintItem, TemplateSpec } from "./types";

/**
 * Thermal label printers (Zebra, Rollo, MUNBYN…) print black and nothing else: a colour or a
 * grey comes out as a speckle of dots that blurs text and stops codes scanning. A template set
 * for a thermal printer prints every colour as solid black or white instead, whichever it is
 * closer to (dark blue text: black; a yellow band: white; white text on a dark band stays
 * readable), codes in solid black, and pictures in black and white.
 */

const NAMED: Record<string, string> = { black: "#000000", white: "#ffffff", transparent: "transparent", none: "transparent" };

/** #rgb, #rgba, #rrggbb, #rrggbbaa → [r, g, b, a] (0–1), or null. */
function parse(c: string): [number, number, number, number] | null {
  const m = c.trim().toLowerCase().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (!m) return null;
  const h = m[1].length <= 4 ? [...m[1]].map((x) => x + x).join("") : m[1];
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}

/** The black or white a colour prints as (transparent stays transparent; a faint colour is paper). */
export function ink(color: string | undefined | null): string {
  const c = (color ?? "").trim().toLowerCase();
  if (!c) return "#000000";
  if (c in NAMED) return NAMED[c];
  const rgb = parse(c);
  if (!rgb) return "#000000";
  const [r, g, b, a] = rgb;
  if (a < 0.35) return "transparent";
  // relative luminance (sRGB): what the eye sees as light or dark
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return l < 0.4 ? "#000000" : "#ffffff";
}

const isColor = (v: string) => /^#[0-9a-f]{3,8}$/i.test(v.trim());

/** The template as it prints on a thermal printer: every fixed colour black or white, codes black. */
export function thermalLayers(layers: Layer[]): Layer[] {
  return layers.map((l) => {
    switch (l.type) {
      case "text":
        return { ...l, color: ink(l.color ?? "#111111") };
      case "box":
        // a field ({{DIVISION_COLOR}}) is turned per tag (thermalValues)
        return { ...l, fill: l.fill && !l.fill.includes("{{") ? ink(l.fill) : l.fill, border: l.border ? ink(l.border) : l.border };
      case "barcode":
      case "qr":
        return { ...l, color: "#000000" };
      case "image":
        // the picture itself (made black and white by the page), not the uploaded PDF in colour
        return { ...l, pdf: undefined };
      default:
        return l;
    }
  });
}

/** Each tag's colour values ({{DIVISION_COLOR}}) as black or white. */
export function thermalValues(items: PrintItem[]): PrintItem[] {
  return items.map((it) => ({ ...it, values: Object.fromEntries(Object.entries(it.values).map(([k, v]) => [k, isColor(v) ? ink(v) : v])) }));
}

/**
 * A label printer is fed the narrow way: a label wider than tall (6″ × 4″ as Kinus measures the
 * Zebra 4×6) goes on a page as tall as it is wide (4″ × 6″), turned a quarter, so the printer
 * gets a page exactly the size of its label.
 */
export const turnsOnPage = (t: Pick<TemplateSpec, "thermal" | "sheet_layout" | "page_width_mm" | "page_height_mm">) =>
  Boolean(t.thermal) && !t.sheet_layout && t.page_width_mm > t.page_height_mm;

/** Pictures and the background, for the page's CSS: grey, then pushed to black and white. */
export const THERMAL_PICTURE_CSS = ".bg,.im{filter:grayscale(1) contrast(1.8)}";
