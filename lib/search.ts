import { normalizeName } from "@/lib/import/normalize";

export type SearchEntry = { name: string; words: string[]; code: string; phones: string };

/** Precomputes what a camper can be found by: name in any order/language, code, parent phone digits. */
export function searchEntry(name: string, code: string, phones: string[] = []): SearchEntry {
  const n = normalizeName(name);
  return { name: n, words: n.split(" ").filter(Boolean), code, phones: phones.map((p) => p.replace(/\D/g, "")).join(" ") };
}

/**
 * How well `q` matches (0 = not at all). Every word typed must start a word of the name
 * ("levi coh" finds "Cohen, Levi"); or the code starts with it; or 4+ digits end a parent phone.
 */
export function matchScore(e: SearchEntry, q: string): number {
  const raw = q.trim();
  if (!raw) return 1;
  const digits = raw.replace(/\D/g, "");
  if (digits && digits.length === raw.replace(/[\s()+-]/g, "").length) {
    if (e.code.startsWith(digits)) return 3;
    if (digits.length >= 4 && e.phones.split(" ").some((p) => p.endsWith(digits) || (digits.length >= 7 && p.includes(digits)))) return 2;
    return 0;
  }
  const needle = normalizeName(raw);
  if (e.name.startsWith(needle)) return 3;
  const parts = needle.split(" ").filter(Boolean);
  if (parts.every((p) => e.words.some((w) => w.startsWith(p)))) return 2;
  if (needle.length >= 3 && e.name.includes(needle)) return 1;
  return 0;
}
