import bwipjs from "bwip-js/node";

/** Code 128 bars only (the human-readable line is drawn separately so it never stretches). */
export function code128Svg(text: string): string {
  if (!text) return "";
  try {
    return bwipjs.toSVG({ bcid: "code128", text, height: 10, includetext: false, paddingwidth: 0, paddingheight: 0 });
  } catch {
    return "";
  }
}

export function qrSvg(text: string): string {
  if (!text) return "";
  try {
    return bwipjs.toSVG({ bcid: "qrcode", text });
  } catch {
    return "";
  }
}
