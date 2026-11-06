import type { Layer, TemplateSpec } from "./types";

/** What the quick staff tag says (Print → Staff tags → Quick staff tag): typed in on the spot. */
export type QuickTag = {
  top: string;
  name: string;
  line2: string;
  line3: string;
  qr: string;
};

const LIMITS: Record<keyof QuickTag, number> = {
  top: 30,
  name: 60,
  line2: 60,
  line3: 60,
  qr: 300,
};

/** Typed text as it may go on the tag: one line, no {{fields}} (it prints as typed), not too long. */
export function cleanQuickTag(
  input: Partial<Record<keyof QuickTag, unknown>>,
): QuickTag {
  const clean = (k: keyof QuickTag) =>
    String(input[k] ?? "")
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LIMITS[k]);
  return {
    top: clean("top"),
    name: clean("name"),
    line2: clean("line2"),
    line3: clean("line3"),
    qr: clean("qr"),
  };
}

/**
 * The 50 × 80 mm thermal staff tag, upright (printed turned a quarter, as the label printer takes
 * it): the word on top (STAFF), a rule, the name big, two lines under it, and a QR code at the
 * bottom when there's a link. Without a QR code the name and lines get the room.
 */
export function quickTagSpec(t: QuickTag, font = "sans"): TemplateSpec {
  const text = (
    id: string,
    value: string,
    y: number,
    h: number,
    size: number,
    minSize: number,
    extra: Partial<Layer> = {},
  ): Layer[] =>
    value
      ? [
          {
            type: "text",
            id,
            text: value,
            x: 2.5,
            y,
            w: 45,
            h,
            size,
            minSize,
            align: "center",
            font,
            fit: true,
            ...extra,
          } as Layer,
        ]
      : [];
  const qr = Boolean(t.qr);
  // with a QR code: the text in the top 48 mm, the code (25 mm, scans well at 203 dpi) under it
  const y = qr
    ? { name: 17, nameH: 16, l2: 34, l3: 41, qr: 51 }
    : { name: 20, nameH: 20, l2: 44, l3: 56 };
  const layers: Layer[] = [
    ...text("top", t.top, 4, 9, 22, 14, { weight: 700 }),
    ...(t.top
      ? [
          {
            type: "box",
            id: "rule",
            x: 10,
            y: 14.5,
            w: 30,
            h: 0.6,
            fill: "#000000",
          } as Layer,
        ]
      : []),
    ...text("name", t.name, y.name, y.nameH, 22, 12, {
      weight: 700,
      wrap: true,
      valign: "middle",
      lineHeight: 1.15,
    }),
    ...text("line2", t.line2, y.l2, qr ? 6 : 7, 13, 8),
    ...text("line3", t.line3, y.l3, qr ? 7 : 8, 15, 9, { weight: 700 }),
    ...(qr
      ? [
          {
            type: "qr",
            id: "qr",
            text: t.qr,
            x: 12.5,
            y: y.qr!,
            w: 25,
            h: 25,
            color: "#000000",
            shape: "square",
          } as Layer,
        ]
      : []),
  ];
  return {
    name: `Staff tag – ${t.name || "quick"}`,
    kind: "name_tag",
    page_width_mm: 50,
    page_height_mm: 80,
    layers,
    sheet_layout: null,
    back: null,
    thermal: true,
  };
}
