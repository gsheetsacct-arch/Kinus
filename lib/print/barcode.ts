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
