import bwipjs from "bwip-js/node";

/** Blank space each side of Code 128 bars, in bar widths: scanners need it to find the code. */
export const QUIET_MODULES = 10;

/**
 * Code 128 bars only (the human-readable line is drawn separately so it never stretches),
 * with the quiet zone built in, so a box drawn right next to it can't make it unreadable.
 */
export function code128Svg(text: string): string {
  if (!text) return "";
  try {
    return bwipjs.toSVG({ bcid: "code128", text, height: 10, includetext: false, paddingwidth: QUIET_MODULES, paddingheight: 0 });
  } catch {
    return "";
  }
}

/** Width of the code in bar widths, quiet zones included (the SVG is 2 units per bar width). */
export function code128Modules(svg: string): number {
  const m = /viewBox="0 0 ([\d.]+) /.exec(svg);
  return m ? Number(m[1]) / 2 : 0;
}

export function qrSvg(text: string): string {
  if (!text) return "";
  try {
    return bwipjs.toSVG({ bcid: "qrcode", text, paddingwidth: 4, paddingheight: 4 }); // two squares of white around it
  } catch {
    return "";
  }
}

/** Light squares between a round QR's code and its made-up squares: scanners find the code by it. */
export const ROUND_QR_GAP = 2;

/**
 * A round QR (as on restaurant pagers): the real code in the middle, a ring of light squares
 * around it (ROUND_QR_GAP), and made-up squares out to the circle, so the whole thing reads as
 * one round pattern. The made-up squares are the same for the same text. Scanners find the
 * code by its three corner squares and read it as usual. Drawn on a white disc.
 */
export function qrRoundSvg(text: string): string {
  if (!text) return "";
  try {
    // error correction Q: the code still reads with a quarter of it scuffed
    const [code] = bwipjs.raw({ bcid: "qrcode", text, eclevel: "Q" } as Parameters<typeof bwipjs.raw>[0]) as unknown as { pixx: number; pixy: number; pixs: number[] }[];
    const n = code.pixx;
    // the code's corners (with the light ring) just inside the circle; odd, so it's centred
    let size = Math.ceil((n / 2 + ROUND_QR_GAP) * Math.SQRT2 * 2) + 1;
    if (size % 2 === 0) size++;
    const at = (size - n) / 2;
    const middle = size / 2;
    // the made-up squares: a small seeded generator, so the same text always looks the same
    let seed = 2166136261;
    for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619) >>> 0;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const dark = (x: number, y: number): boolean => {
      const cx = x - at;
      const cy = y - at;
      if (cx >= 0 && cy >= 0 && cx < n && cy < n) return code.pixs[cy * n + cx] === 1;
      // the light ring around the code
      if (cx >= -ROUND_QR_GAP && cy >= -ROUND_QR_GAP && cx < n + ROUND_QR_GAP && cy < n + ROUND_QR_GAP) return false;
      // made-up squares, only where the square touches the circle
      const nx = Math.max(x, Math.min(middle, x + 1)) - middle;
      const ny = Math.max(y, Math.min(middle, y + 1)) - middle;
      return random() < 0.45 && nx * nx + ny * ny < middle * middle;
    };
    let d = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; ) {
        if (!dark(x, y)) {
          x++;
          continue;
        }
        let w = 1;
        while (x + w < size && dark(x + w, y)) w++;
        d += `M${x} ${y}h${w}v1h${-w}z`;
        x += w;
      }
    }
    const id = `rq${(seed >>> 0).toString(36)}`;
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${id}"><circle cx="${middle}" cy="${middle}" r="${middle}"/></clipPath></defs><circle cx="${middle}" cy="${middle}" r="${middle}" fill="#ffffff"/><path clip-path="url(#${id})" d="${d}"/></svg>`;
  } catch {
    return "";
  }
}
