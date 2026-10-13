/**
 * The fonts a text part can use. Each covers English, French and Hebrew, and is embedded in
 * the printed page (lib/print/fonts), so what the editor shows is what prints.
 */
export const FONTS = {
  sans: { label: "Clear", sample: "Noto Sans", family: "Kinus Sans" },
  rounded: { label: "Friendly", sample: "Rubik", family: "Kinus Rounded" },
  serif: { label: "Classic", sample: "Frank Ruhl", family: "Kinus Serif" },
  display: { label: "Bold display", sample: "Secular One", family: "Kinus Display" },
} as const;
export type FontKey = keyof typeof FONTS;

/** The CSS font-family for a part, falling back to the default font for any letter it lacks. */
export const fontStack = (k?: string) => `"${FONTS[(k ?? "sans") as FontKey]?.family ?? "Kinus Sans"}","Kinus Sans","Noto Sans","Noto Sans Hebrew",Arial,sans-serif`;
