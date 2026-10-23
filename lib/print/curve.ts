/**
 * Curved text: a text part can run along the top or the bottom of the circle inside its box
 * (on a round sticker, the name around the top and the number around the bottom). The
 * letters are centred on a circle just inside the box, so they stay on the sticker; the text
 * is centred on the arc and shrinks until it fits along it. The bottom reads left to right
 * with its letters upright, like the top.
 *
 * Sizes are in mm (the SVG drawing is in mm). The printed page runs the same geometry (this
 * function's own code is put into the page) and the same steps as fitCurve.
 */
export const DEFAULT_ARC = 180;

/** The arc the text runs on, and its length (mm), for text `sizeMm` high in a box `w` × `h`. */
export function curvePath(w: number, h: number, side: string, arcDeg: number, sizeMm: number): { d: string; length: number } {
  const radius = Math.min(w, h) / 2;
  // centred on this circle, a letter's top and its tail both stay inside the box
  const r = Math.max(0.5, radius - sizeMm * 0.55);
  const a = (Math.min(350, Math.max(20, arcDeg || 180)) * Math.PI) / 180;
  const bottom = side === "bottom";
  const mid = bottom ? Math.PI / 2 : -Math.PI / 2;
  // the top goes clockwise, the bottom anticlockwise: both left to right, letters upright
  const from = bottom ? mid + a / 2 : mid - a / 2;
  const to = bottom ? mid - a / 2 : mid + a / 2;
  const at = (t: number) => `${(w / 2 + r * Math.cos(t)).toFixed(3)} ${(h / 2 + r * Math.sin(t)).toFixed(3)}`;
  return { d: `M ${at(from)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${a > Math.PI ? 1 : 0} ${bottom ? 0 : 1} ${at(to)}`, length: r * a };
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
    text.setAttribute("font-size", v.toFixed(3));
    length = g.length;
  };
  const over = () => text.getComputedTextLength() > length + 0.01;
  set(s);
  if (o.fit !== false) {
    for (let i = 0; i < 200 && s > o.minMm && over(); i++) set((s = Math.max(o.minMm, s * 0.97)));
    // too long even at its smallest size: smaller still, so it prints whole
    for (let i = 0; i < 200 && s > o.floorMm && over(); i++) set((s = Math.max(o.floorMm, s * 0.97)));
  }
  return { sizeMm: s, below: s < o.minMm - 1e-6, overflow: over() };
}
