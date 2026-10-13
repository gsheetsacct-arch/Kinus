import "server-only";
import { createHash } from "node:crypto";
import type { TemplateSpec } from "./types";

/** The merge fields a template prints ({{FIRST}}, {{BUNK_HE|BUNK}} → FIRST, BUNK_HE, BUNK). */
export function templateKeys(spec: Pick<TemplateSpec, "layers">): string[] {
  const keys = new Set<string>();
  for (const l of spec.layers) {
    const text = "text" in l ? l.text : (l.fill ?? "");
    for (const m of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) for (const k of m[1].split("|")) keys.add(k.trim());
  }
  return [...keys].sort();
}

const sha = (s: string, n: number) => createHash("sha1").update(s).digest("hex").slice(0, n);

/**
 * A fingerprint of what a camper's label says: a short fingerprint per field the template
 * uses ("v2;BUNK=…;FIRST=…"). Saved with each printed label, so "changed since printed" can be
 * found later. Moving things around on the template doesn't count as a change, and neither
 * does adding a field to it: only fields that were on the printed label are compared.
 */
export function contentHash(keys: string[], values: Record<string, string>): string {
  return `v2;${keys.map((k) => `${k}=${sha(values[k] ?? "", 10)}`).join(";")}`;
}

/** The fingerprint labels got before per-field fingerprints. */
const legacyHash = (keys: string[], values: Record<string, string>) => sha(keys.map((k) => `${k}=${values[k] ?? ""}`).join("\n"), 20);

/** Whether a label printed with fingerprint `printed` still says the same as it would now. */
export function sameContent(printed: string, keys: string[], values: Record<string, string>): boolean {
  if (!printed.startsWith("v2;")) return printed === legacyHash(keys, values);
  const was = new Map(
    printed
      .slice(3)
      .split(";")
      .filter(Boolean)
      .map((p) => [p.slice(0, p.lastIndexOf("=")), p.slice(p.lastIndexOf("=") + 1)] as const),
  );
  const shared = keys.filter((k) => was.has(k));
  // a whole new design shares no fields: that's the template changing, not the camper
  if (!shared.length) return true;
  return shared.every((k) => was.get(k) === sha(values[k] ?? "", 10));
}
