/**
 * Barcodes and QR codes in a colour. The codes are drawn black on white (bwip-js); this
 * paints the bars / squares another colour, the same way in the editor and in print.
 * Scanners need dark on light: see codeContrast.
 */
const HEX = /^#[0-9a-f]{6}$/i;

export function tintCode(svg: string, color: string | undefined): string {
  if (!svg || !color || !HEX.test(color) || color.toLowerCase() === "#000000") return svg;
  // barcodes: stroked lines; QR codes: filled paths with no colour of their own
  return svg.replace(/stroke="#000000"/g, `stroke="${color}"`).replace(/<path (?![^>]*\bstroke=)/g, `<path fill="${color}" `);
}

/** Contrast with white paper (1 = none, 21 = black). Under 4.5 a scanner may not read it. */
export function codeContrast(color: string | undefined): number {
  if (!color || !HEX.test(color)) return 21;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05);
}
export const MIN_CODE_CONTRAST = 4.5;
