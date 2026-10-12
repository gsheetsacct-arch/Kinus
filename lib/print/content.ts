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

/**
 * A fingerprint of what a camper's label says (their values for the fields the template
 * uses). Saved with each printed label, so "changed since printed" can be found later.
 * Moving things around on the template doesn't count as a change.
 */
export function contentHash(keys: string[], values: Record<string, string>): string {
  return createHash("sha1")
    .update(keys.map((k) => `${k}=${values[k] ?? ""}`).join("\n"))
    .digest("hex")
    .slice(0, 20);
}
