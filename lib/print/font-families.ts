/**
 * The fonts a text part can use. Each covers English, French and Hebrew, and is embedded in
 * the printed page (lib/print/fonts), so what the editor shows is what prints.
 */
export const FONTS = {
  sans: { label: "Clear", sample: "Noto Sans", family: "Kinus Sans", lineHeight: 1.3 },
  rounded: { label: "Friendly", sample: "Rubik", family: "Kinus Rounded", lineHeight: 1.3 },
  serif: { label: "Classic", sample: "Frank Ruhl", family: "Kinus Serif", lineHeight: 1.3 },
  display: { label: "Bold display", sample: "Secular One", family: "Kinus Display", lineHeight: 1.5 },
} as const;
export type FontKey = keyof typeof FONTS;

/** The CSS font-family for a part, falling back to the default font for any letter it lacks. */
export const fontStack = (k?: string) => `"${FONTS[(k ?? "sans") as FontKey]?.family ?? "Kinus Sans"}","Kinus Sans","Noto Sans","Noto Sans Hebrew",Arial,sans-serif`;

/**
 * Line height (× the text size) for each font: tall enough that every letter shows whole, from
 * accents above capitals (É, Å) to tails below (g, y, ק, ţ) and Hebrew vowel points. Measured
 * from the fonts themselves; text lines are clipped to it, so a smaller one would cut letters off.
 * The same value is used on the canvas, in the every-camper check and on the printed page.
 */
export const lineHeightOf = (k?: string) => FONTS[(k ?? "sans") as FontKey]?.lineHeight ?? FONTS.sans.lineHeight;
