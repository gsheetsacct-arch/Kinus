import "server-only";
import { createHash } from "node:crypto";
import { DIVISION_VALUE, onBack, pictureFor, type TemplateSpec } from "./types";

/** The pictures a camper's label shows when its template has a picture per division. */
export const PICTURES_VALUE = "__pictures";

/**
 * What a template prints that can differ between campers: each {{field}} as written
 * ({{FIRST}} → FIRST, {{BUNK_HE|BUNK}} → "BUNK_HE|BUNK": whichever of them shows), and the
 * per-division pictures. Hidden parts don't print, nor does the back of a one-sided tag.
 */
export function templateKeys(spec: Pick<TemplateSpec, "layers"> & { back?: TemplateSpec["back"] }): string[] {
  const keys = new Set<string>();
  for (const l of spec.layers) {
    if (l.hidden || (onBack(l) && !spec.back)) continue;
    const text = "text" in l ? l.text : l.type === "box" ? (l.fill ?? "") : "";
    for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) keys.add(m[1].split("|").map((k) => k.trim()).join("|"));
    // a picture per division: a move to a division with another picture changes the label
    if (l.type === "image" && Object.keys(l.byDivision ?? {}).length) keys.add(PICTURES_VALUE);
  }
  return [...keys].sort();
}

/** The merge values with what the label shows of its per-division pictures (PICTURES_VALUE). */
export function labelValues(spec: Pick<TemplateSpec, "layers">, values: Record<string, string>): Record<string, string> {
  const pictures = spec.layers.filter((l) => l.type === "image" && !l.hidden && Object.keys(l.byDivision ?? {}).length);
  if (!pictures.length) return values;
  return { ...values, [PICTURES_VALUE]: pictures.map((l) => pictureFor(l as { path: string; byDivision?: Record<string, string> }, values[DIVISION_VALUE])).join("\n") };
}

/** A key's value as printed: of alternatives the first that isn't empty (as on the label). */
const valueOf = (k: string, values: Record<string, string>) => {
  for (const alt of k.split("|")) if ((values[alt] ?? "") !== "") return values[alt];
  return "";
};
// spaces at the ends or doubled don't show on a label
const tidy = (v: string) => v.replace(/\s+/g, " ").trim();

const sha = (s: string, n: number) => createHash("sha1").update(s).digest("hex").slice(0, n);

/**
 * A fingerprint of what a camper's label says: a short fingerprint per field the template
 * uses ("v2;BUNK=…;FIRST=…"). Saved with each printed label, so "changed since printed" can be
 * found later. Moving things around on the template doesn't count as a change, and neither
 * does adding a field to it: only fields that were on the printed label are compared.
 */
export function contentHash(keys: string[], values: Record<string, string>): string {
  return `v2;${keys.map((k) => `${k}=${sha(tidy(valueOf(k, values)), 10)}`).join(";")}`;
}

/** The fingerprint labels got before per-field fingerprints. */
const legacyHash = (keys: string[], values: Record<string, string>) => sha(keys.map((k) => `${k}=${values[k] ?? ""}`).join("\n"), 20);

/** Whether a label printed with fingerprint `printed` still says the same as it would now. */
export function sameContent(printed: string, keys: string[], values: Record<string, string>): boolean {
  if (!printed.startsWith("v2;")) return printed === legacyHash(legacyKeys(keys), values);
  const was = new Map(
    printed
      .slice(3)
      .split(";")
      .filter(Boolean)
      .map((p) => [p.slice(0, p.lastIndexOf("=")), p.slice(p.lastIndexOf("=") + 1)] as const),
  );
  // the same (as it printed then: before tidying, labels kept the value exactly)
  const same = (k: string, v: string) => was.get(k) === sha(tidy(v), 10) || was.get(k) === sha(v, 10);
  for (const k of keys) {
    if (was.has(k)) {
      if (!same(k, valueOf(k, values))) return false;
    } else if (k === PICTURES_VALUE || k.includes("|")) {
      // labels printed before: alternatives kept each of them, a division picture the division
      const parts = k === PICTURES_VALUE ? [DIVISION_VALUE] : k.split("|");
      if (parts.some((p) => was.has(p) && !same(p, values[p] ?? ""))) return false;
    }
  }
  // fields the label didn't have aren't compared: a field added to the template, or a whole
  // new design, is the template changing, not the camper
  return true;
}

/** The keys as listed before alternatives were kept together (for the oldest fingerprints). */
const legacyKeys = (keys: string[]) => [...new Set(keys.flatMap((k) => (k === PICTURES_VALUE ? [DIVISION_VALUE] : k.split("|"))))].sort();
