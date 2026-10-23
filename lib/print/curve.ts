/**
 * Curved text: a text part can run along the top or the bottom of the circle inside its box
 * (on a round sticker, the name around the top and the number around the bottom). The
 * letters are centred on a circle just inside the box, so they stay on the sticker; the text
 * is centred on the arc and shrinks until it fits along it. The bottom reads left to right
 * with its letters upright, like the top.
 *
 * Sizes are given in mm; the SVG drawing is in hundredths of a mm (CURVE_SCALE): text a few
 * units high is spaced by rounded letter widths in some Chromium builds (the PDF maker's),
 * which spreads the letters apart. The printed page runs the same geometry (this function's
 * own code is put into the page) and the same steps as fitCurve.
 */
export const DEFAULT_ARC = 180;
export const CURVE_SCALE = 100;

/** The arc the text runs on, and its length, for text `sizeMm` high in a box `w` × `h` mm: in drawing units (mm × 100). */
export function curvePath(w: number, h: number, side: string, arcDeg: number, sizeMm: number): { d: string; length: number } {
  // in the drawing's units (kept inside, so the page can use this function's code on its own)
  w *= 100;
  h *= 100;
  sizeMm *= 100;
  const radius = Math.min(w, h) / 2;
  // centred on this circle, a letter's top and its tail both stay inside the box
  const r = Math.max(50, radius - sizeMm * 0.55);
  const a = (Math.min(350, Math.max(20, arcDeg || 180)) * Math.PI) / 180;
  const bottom = side === "bottom";
  const mid = bottom ? Math.PI / 2 : -Math.PI / 2;
  // the top goes clockwise, the bottom anticlockwise: both left to right, letters upright
  const from = bottom ? mid + a / 2 : mid - a / 2;
  const to = bottom ? mid - a / 2 : mid + a / 2;
  const at = (t: number) => `${(w / 2 + r * Math.cos(t)).toFixed(1)} ${(h / 2 + r * Math.sin(t)).toFixed(1)}`;
  return { d: `M ${at(from)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${a > Math.PI ? 1 : 0} ${bottom ? 0 : 1} ${at(to)}`, length: r * a };
}

/** Shrinks curved text (an SVG <text> on its <path>) until it fits its arc; sizes in mm. */
export function fitCurve(
  text: SVGTextElement,
  path: SVGPathElement,
  o: { w: number; h: number; side: string; arc: number; sizeMm: number; minMm: number; floorMm: number; fit?: boolean },
): { sizeMm: number; below: boolean; overflow: boolean } {
  let s = o.sizeMm;
  let length = 0;
  const set = (v: number) => {
    const g = curvePath(o.w, o.h, o.side, o.arc, v);
    path.setAttribute("d", g.d);
    text.setAttribute("font-size", (v * CURVE_SCALE).toFixed(1));
    length = g.length;
  };
  const over = () => text.getComputedTextLength() > length + 1;
  set(s);
  if (o.fit !== false) {
    for (let i = 0; i < 200 && s > o.minMm && over(); i++) set((s = Math.max(o.minMm, s * 0.97)));
    // too long even at its smallest size: smaller still, so it prints whole
    for (let i = 0; i < 200 && s > o.floorMm && over(); i++) set((s = Math.max(o.floorMm, s * 0.97)));
  }
  return { sizeMm: s, below: s < o.minMm - 1e-6, overflow: over() };
}
