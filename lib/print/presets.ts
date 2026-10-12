import type { SheetLayout } from "./types";

/**
 * Label stock Kinus knows exactly. Sheets give the first label's top-left corner and the
 * distance from one label to the start of the next (pitch), as the manufacturers publish
 * them; rolls (label printers) are one label per page.
 *
 * Sources: Avery's template specifications and Microsoft Word's built-in Avery labels for
 * US Letter; Avery UK specifications for A4 (those sheets are centred on the page);
 * Dymo, Brother and Zebra label sizes as sold. Every sheet here is checked by a test:
 * the labels fit on the paper and the margins match left to right.
 */
export type LabelPreset = {
  id: string;
  brand: string;
  /** The product number on the box. */
  product: string;
  /** Other product numbers with the same layout. */
  alsoFits: string[];
  name: string;
  group: "badge" | "small" | "medium" | "large" | "roll";
  /** Label size in mm, as it stands on the tag (wider than tall for rolls). */
  widthMm: number;
  heightMm: number;
  sheet: { paper: SheetLayout["paper"]; cols: number; rows: number; leftMm: number; topMm: number; pitchXMm: number; pitchYMm: number } | null;
};

export const PRESET_GROUPS: Record<LabelPreset["group"], string> = {
  badge: "Name badges and cards (sheets)",
  small: "Small labels (sheets)",
  medium: "Address and shipping labels (sheets)",
  large: "Large labels and half sheets (sheets)",
  roll: "Label printers (one label at a time)",
};

const IN = 25.4;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A US Letter sheet, in inches. */
function letter(product: string, alsoFits: string[], name: string, group: LabelPreset["group"], w: number, h: number, cols: number, rows: number, left: number, top: number, pitchX: number, pitchY: number): LabelPreset {
  return {
    id: `avery-${product.toLowerCase()}`,
    brand: "Avery",
    product,
    alsoFits,
    name,
    group,
    widthMm: r2(w * IN),
    heightMm: r2(h * IN),
    sheet: { paper: "letter", cols, rows, leftMm: r2(left * IN), topMm: r2(top * IN), pitchXMm: r2(pitchX * IN), pitchYMm: r2(pitchY * IN) },
  };
}

/** An A4 sheet, in mm, centred on the page (as Avery's A4 sheets are). */
function a4(product: string, alsoFits: string[], name: string, group: LabelPreset["group"], w: number, h: number, cols: number, rows: number, pitchX: number, pitchY: number, at?: { left: number; top: number }): LabelPreset {
  const left = at?.left ?? (210 - (pitchX * (cols - 1) + w)) / 2;
  const top = at?.top ?? (297 - (pitchY * (rows - 1) + h)) / 2;
  return {
    id: `avery-${product.toLowerCase()}`,
    brand: "Avery",
    product,
    alsoFits,
    name,
    group,
    widthMm: w,
    heightMm: h,
    sheet: { paper: "a4", cols, rows, leftMm: r2(left), topMm: r2(top), pitchXMm: pitchX, pitchYMm: pitchY },
  };
}

/** A roll for a label printer, in mm (or inches with `inches`). */
function roll(brand: string, product: string, alsoFits: string[], name: string, w: number, h: number, inches = false): LabelPreset {
  const [a, b] = [w, h].map((n) => r2(inches ? n * IN : n)).sort((x, y) => y - x);
  return { id: `${brand}-${product}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), brand, product, alsoFits, name, group: "roll", widthMm: a, heightMm: b, sheet: null };
}

export const LABEL_PRESETS: LabelPreset[] = [
  // ---- Name badges and cards (US Letter)
  letter("5395", ["8395", "5095", "5895", "15395"], "Name badges 2⅓″ × 3⅜″, 8 per sheet", "badge", 3.375, 2.3333, 2, 4, 0.6875, 0.5833, 3.75, 2.5),
  letter("5390", [], "Name badge inserts 2¼″ × 3½″, 8 per sheet", "badge", 3.5, 2.25, 2, 4, 0.75, 1, 3.5, 2.25),
  letter("5392", ["5384"], "Name badge inserts 3″ × 4″, 6 per sheet", "badge", 4, 3, 2, 3, 0.25, 1, 4, 3),
  letter("5371", ["8371", "5376", "5377", "5871", "5872", "5877", "8471", "8871", "8877", "27871", "28371"], "Business cards 2″ × 3½″, 10 per sheet", "badge", 3.5, 2, 2, 5, 0.75, 0.5, 3.5, 2),
  letter("8373", ["5881", "8869", "28373"], "Business cards 2″ × 3½″, 8 per sheet", "badge", 3.5, 2, 2, 4, 0.5, 0.75, 4, 2.5),
  letter("5388", ["5386", "8388"], "Index cards 3″ × 5″, 3 per sheet", "badge", 5, 3, 1, 3, 1.75, 1, 5, 3),
  letter("5389", [], "Postcards 4″ × 6″, 2 per sheet", "badge", 6, 4, 1, 2, 1.25, 1.25, 6, 4.5),

  // ---- Small labels (US Letter)
  letter("5167", ["8167", "5267", "5667", "5927", "6467", "6504", "8567", "8667", "8927", "15167", "15267", "18167", "18667"], "Return address ½″ × 1¾″, 80 per sheet", "small", 1.75, 0.5, 4, 20, 0.28125, 0.5, 2.0625, 0.5),
  letter("5366", ["8366", "5066", "5166", "5266", "5268", "5368", "5378", "5666", "5766", "5866", "5966", "6466", "6505", "8066", "8166", "8478"], "File folder labels ⅔″ × 37⁄16″, 30 per sheet", "small", 3.4375, 0.6667, 2, 15, 0.53125, 0.5, 4, 0.6667),
  letter("5160", ["8160", "5260", "5510", "5520", "5560", "5810", "5920", "5960", "5970", "5971", "5972", "5979", "5980", "6231", "6233", "6245", "6460", "6498", "8250", "8460", "8560", "8620", "8660", "8810", "8920", "8930", "15160", "18160", "18660", "25160"], "Address labels 1″ × 2⅝″, 30 per sheet", "small", 2.625, 1, 3, 10, 0.1875, 0.5, 2.75, 1),
  letter("5161", ["8161", "5261", "5961", "8461", "18161"], "Address labels 1″ × 4″, 20 per sheet", "small", 4, 1, 2, 10, 0.15625, 0.5, 4.1875, 1),
  letter("6871", [], "Labels 1¼″ × 2⅜″, 18 per sheet", "small", 2.375, 1.25, 3, 6, 0.375, 1.125, 2.6875, 1.5),
  letter("6879", ["8769"], "Labels 1¼″ × 3¾″, 12 per sheet", "small", 3.75, 1.25, 2, 6, 0.375, 1.125, 4, 1.5),

  // ---- Address and shipping labels (US Letter)
  letter("5162", ["8162", "5262", "5512", "5522", "5922", "5962", "8252", "8462", "8662", "15162", "18162", "18662"], "Address labels 1⅓″ × 4″, 14 per sheet", "medium", 4, 1.3333, 2, 7, 0.15625, 0.8333, 4.1875, 1.3333),
  letter("5159", [], "Address labels 1½″ × 4″, 14 per sheet", "medium", 4, 1.5, 2, 7, 0.15625, 0.25, 4.1875, 1.5),
  letter("5197", [], "Labels 1½″ × 4″, 12 per sheet", "medium", 4, 1.5, 2, 6, 0.1875, 1, 4.125, 1.5),
  letter("5163", ["8163", "5263", "5513", "5523", "5795", "5923", "5963", "5978", "8253", "8463", "8663", "8763", "8923", "15163", "18163", "18663"], "Shipping labels 2″ × 4″, 10 per sheet", "medium", 4, 2, 2, 5, 0.15625, 0.5, 4.1875, 2),
  letter("5663", [], "Shipping labels 2″ × 4¼″, 10 per sheet (edge to edge)", "medium", 4.25, 2, 2, 5, 0, 0.5, 4.25, 2),
  letter("6873", [], "Labels 2″ × 3¾″, 8 per sheet", "medium", 3.75, 2, 2, 4, 0.375, 1.125, 4, 2.25),
  letter("6490", ["6501", "6861", "8096"], "Labels 2″ × 2-11⁄16″, 15 per sheet", "medium", 2.6875, 2, 3, 5, 0.125, 0.5, 2.78125, 2),
  letter("3274.1", ["3111"], "Square labels 2½″ × 2½″, 9 per sheet", "medium", 2.5, 2.5, 3, 3, 0.3125, 1.25, 2.6875, 3),

  // ---- Large labels and half sheets (US Letter)
  letter("5164", ["8164", "5264", "5514", "5524", "6464", "6499", "8254", "8464"], "Shipping labels 3⅓″ × 4″, 6 per sheet", "large", 4, 3.3333, 2, 3, 0.15625, 0.5, 4.1875, 3.3333),
  letter("6874", [], "Labels 3″ × 3¾″, 6 per sheet", "large", 3.75, 3, 2, 3, 0.375, 0.625, 4, 3.375),
  letter("5168", ["8168"], "Shipping labels 3½″ × 5″, 4 per sheet", "large", 3.5, 5, 2, 2, 0.5, 0.5, 4, 5),
  letter("5126", ["8126", "5526", "15516", "18126"], "Half-sheet labels 5½″ × 8½″, 2 per sheet", "large", 8.5, 5.5, 1, 2, 0, 0, 8.5, 5.5),

  // ---- A4 (Avery UK / Europe)
  a4("L4785", ["L4784", "L4786", "L4787"], "Name badges 80 × 50 mm, 10 per sheet", "badge", 80, 50, 2, 5, 95, 55, { left: 17.5, top: 13.5 }),
  a4("L7651", ["J8651", "L7551", "L8651"], "Mini labels 38.1 × 21.2 mm, 65 per sheet", "small", 38.1, 21.2, 5, 13, 40.64, 21.2),
  a4("L7159", ["J8159"], "Labels 63.5 × 33.9 mm, 24 per sheet", "small", 63.5, 33.9, 3, 8, 66.04, 33.9),
  a4("L7160", ["J8160"], "Labels 63.5 × 38.1 mm, 21 per sheet", "small", 63.5, 38.1, 3, 7, 66.04, 38.1),
  a4("L7161", ["J8161"], "Labels 63.5 × 46.6 mm, 18 per sheet", "medium", 63.5, 46.6, 3, 6, 66.04, 46.6),
  a4("L7162", ["J8162"], "Labels 99.1 × 33.9 mm, 16 per sheet", "medium", 99.1, 33.9, 2, 8, 101.6, 33.9),
  a4("L7163", ["J8163"], "Labels 99.1 × 38.1 mm, 14 per sheet", "medium", 99.1, 38.1, 2, 7, 101.6, 38.1),
  a4("L7173", ["J8173"], "Labels 99.1 × 57 mm, 10 per sheet", "medium", 99.1, 57, 2, 5, 101.6, 57),
  a4("L7165", ["J8165"], "Labels 99.1 × 67.7 mm, 8 per sheet", "large", 99.1, 67.7, 2, 4, 101.6, 67.7),
  a4("L7166", ["J8166"], "Labels 99.1 × 93.1 mm, 6 per sheet", "large", 99.1, 93.1, 2, 3, 101.6, 93.1),
  a4("L7169", ["J8169"], "Labels 99.1 × 139 mm, 4 per sheet", "large", 99.1, 139, 2, 2, 101.6, 139),

  // ---- Label printers
  roll("Zebra", "4×6", ["Rollo 4×6", "MUNBYN 4×6", "Dymo 1744907", "Brother DK-1241"], "Shipping label 4″ × 6″", 6, 4, true),
  roll("Zebra", "4×4", ["Rollo 4×4"], "Label 4″ × 4″", 4, 4, true),
  roll("Zebra", "4×3", ["Rollo 4×3"], "Label 4″ × 3″", 4, 3, true),
  roll("Zebra", "4×2", ["Rollo 4×2"], "Label 4″ × 2″", 4, 2, true),
  roll("Zebra", "3×2", ["Rollo 3×2"], "Label 3″ × 2″", 3, 2, true),
  roll("Zebra", "3×1", ["Rollo 3×1"], "Label 3″ × 1″", 3, 1, true),
  roll("Zebra", "2.25×1.25", ["Rollo 2.25×1.25"], "Label 2¼″ × 1¼″", 2.25, 1.25, true),
  roll("Zebra", "2×1", ["Rollo 2×1"], "Label 2″ × 1″", 2, 1, true),
  roll("Dymo", "30252", ["99010"], "Address labels 1⅛″ × 3½″", 89, 28),
  roll("Dymo", "30321", ["99012"], "Large address labels 1.4″ × 3½″", 89, 36),
  roll("Dymo", "30323", ["99014"], "Shipping labels 2⅛″ × 4″", 101, 54),
  roll("Dymo", "30256", [], "Shipping labels 2-5⁄16″ × 4″", 102, 59),
  roll("Dymo", "30857", ["30364"], "Name badges 2¼″ × 4″", 102, 57),
  roll("Dymo", "30856", [], "Name badge cards 2-5⁄16″ × 3⅜″", 86, 62),
  roll("Dymo", "30334", ["11354"], "Multipurpose 2¼″ × 1¼″", 57, 32),
  roll("Dymo", "30336", ["11352"], "Small multipurpose 1″ × 2⅛″", 54, 25),
  roll("Brother", "DK-1201", ["DK-11201"], "Address labels 29 × 90 mm", 90, 29),
  roll("Brother", "DK-1208", ["DK-11208"], "Large address labels 38 × 90 mm", 90, 38),
  roll("Brother", "DK-1202", ["DK-11202"], "Shipping labels 62 × 100 mm", 100, 62),
  roll("Brother", "DK-1209", ["DK-11209"], "Small address labels 29 × 62 mm", 62, 29),
  roll("Brother", "DK-1204", ["DK-11204"], "Multipurpose 17 × 54 mm", 54, 17),
  roll("Brother", "DK-1240", ["DK-11240"], "Large shipping labels 51 × 102 mm", 102, 51),
  roll("Brother", "DK-1247", ["DK-11247"], "Large shipping labels 103 × 164 mm", 164, 103),
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, "");

/** Finds presets by product number (any of the numbers on the box) or by words in the name. */
export function findPresets(query: string): LabelPreset[] {
  const q = norm(query);
  if (!q) return LABEL_PRESETS;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return LABEL_PRESETS.filter((p) => [p.product, ...p.alsoFits].some((n) => norm(n).includes(q)) || words.every((w) => `${p.brand} ${p.name}`.toLowerCase().includes(w)));
}

export const presetById = (id: string | undefined | null) => LABEL_PRESETS.find((p) => p.id === id) ?? null;

/** "3 across, 10 down on Letter" / "One label at a time, on a label printer". */
export function presetSummary(p: LabelPreset): string {
  return p.sheet ? `${p.sheet.cols} across, ${p.sheet.rows} down on ${p.sheet.paper === "a4" ? "A4" : "Letter"} paper` : "One label at a time, on a label printer";
}

/** Which preset a template is set up for: the one saved with its sheet, or a label-printer size that matches. */
export function currentPreset(w: number, h: number, sheet: SheetLayout | null): LabelPreset | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6;
  if (sheet) return LABEL_PRESETS.find((p) => p.id === sheet.preset && near(p.widthMm, w) && near(p.heightMm, h)) ?? null;
  return LABEL_PRESETS.find((p) => !p.sheet && near(p.widthMm, w) && near(p.heightMm, h)) ?? null;
}
