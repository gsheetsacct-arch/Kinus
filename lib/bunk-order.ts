/**
 * Bunks named with Hebrew letters ("Bunk Yud", "Bunk Yud Alef", "Chof Beis", "י״א") sort by
 * their number, not alphabetically: Alef, Beis … Tes, Yud, Yud Alef … Chof, Chof Alef ….
 * Spellings from Ashkenazi, Sephardi and Israeli usage are understood. "Kof" is 20 (as in
 * Chof/Kof); 100 is "Kuf" or "Qof".
 */
const LETTERS: Record<number, string[]> = {
  1: ["alef", "aleph", "olef", "aluf"],
  2: ["beis", "bais", "bet", "beth", "beit", "bes", "beys", "vet", "veis"],
  3: ["gimmel", "gimel", "gimmal", "gimal"],
  4: ["daled", "dalet", "daleth", "doled"],
  5: ["hei", "hey", "heh", "hay", "hai"],
  6: ["vav", "vov", "waw", "vuv", "vaw"],
  7: ["zayin", "zayen", "zain", "zayn"],
  8: ["ches", "chet", "cheth", "het", "heth", "khet", "chess"],
  9: ["tes", "tet", "teth", "tess"],
  10: ["yud", "yod", "yood", "jod"],
  20: ["chof", "kaf", "kof", "caf", "khaf", "chaf", "kaph"],
  30: ["lamed", "lamud", "lamid", "lammed"],
  40: ["mem"],
  50: ["nun", "noon"],
  60: ["samech", "samach", "samekh", "samek"],
  70: ["ayin", "ayen", "ain"],
  80: ["pei", "pey", "peh", "fei", "fey", "feh"],
  90: ["tzadi", "tzadik", "tsadi", "tsadik", "tzaddik", "tzadee", "tzadie"],
  100: ["kuf", "qof", "kuph", "koof", "qoph"],
  200: ["reish", "resh", "raish", "reysh"],
  300: ["shin", "sin"],
  400: ["tav", "taf", "tof", "sav", "sof", "tau"],
};
const NAME_VALUE = new Map(Object.entries(LETTERS).flatMap(([v, names]) => names.map((n) => [n, Number(v)] as const)));
const HEB = "אבגדהוזחטיכלמנסעפצקרשת";
const HEB_VALUE: Record<string, number> = { ך: 20, ם: 40, ן: 50, ף: 80, ץ: 90 };
[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400].forEach((v, i) => (HEB_VALUE[HEB[i]] = v));

const tokenize = (name: string) => name.normalize("NFC").split(/[\s\-_/.,:'"`״׳()]+/).filter(Boolean);

function tokenValue(t: string): number | null {
  const v = NAME_VALUE.get(t.toLowerCase());
  if (v !== undefined) return v;
  // Hebrew script: "י״א" splits into "י" and "א"; "יא" (no gershayim) is short enough to be a number
  if (t.length <= 3 && [...t].every((c) => HEB_VALUE[c] !== undefined)) return [...t].reduce((s, c) => s + HEB_VALUE[c], 0);
  return null;
}

/** The number a name spells in Hebrew letters ("Yud Beis" → 12), or null. */
export function hebrewLetterNumber(name: string): number | null {
  return sortParts(name).value;
}

function sortParts(name: string): { before: string; value: number | null; after: string } {
  const tokens = tokenize(name);
  const start = tokens.findIndex((t) => tokenValue(t) !== null);
  if (start < 0) return { before: tokens.join(" ").toLowerCase(), value: null, after: "" };
  let end = start;
  let value = 0;
  while (end < tokens.length && tokenValue(tokens[end]) !== null) value += tokenValue(tokens[end++])!;
  return { before: tokens.slice(0, start).join(" ").toLowerCase(), value, after: tokens.slice(end).join(" ").toLowerCase() };
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Compares two bunk names: Hebrew-letter numbers by value, digits as numbers, the rest A–Z. */
export function compareBunkNames(a: string, b: string): number {
  const x = sortParts(a);
  const y = sortParts(b);
  const before = natural(x.before, y.before);
  if (before) return before;
  if (x.value !== null && y.value !== null && x.value !== y.value) return x.value - y.value;
  if (x.value !== null && y.value === null) return -1;
  if (x.value === null && y.value !== null) return 1;
  return natural(x.after, y.after) || natural(a, b);
}

/** Bunks named with Hebrew letters (at least two of them), which Alef-Beis order applies to. */
export function usesHebrewLetters(names: string[]): boolean {
  return names.filter((n) => hebrewLetterNumber(n) !== null).length >= 2;
}

/** True when the bunks (in their current order) already follow compareBunkNames. */
export function inNaturalOrder(names: string[]): boolean {
  for (let i = 1; i < names.length; i++) if (compareBunkNames(names[i - 1], names[i]) > 0) return false;
  return true;
}

/** The number in a division's name: "Division 2" → 2, "Division Beis" → 2; none for "BMD". */
export function divisionNumber(name: string): number | null {
  const digits = /\d+/.exec(name);
  return digits ? Number(digits[0]) : hebrewLetterNumber(name);
}

/** Divisions: numbered ones first in number order (Division 1, 2, 3), then the rest A–Z (BMD). */
export function compareDivisionNames(a: string, b: string): number {
  const x = divisionNumber(a);
  const y = divisionNumber(b);
  if (x !== null && y !== null && x !== y) return x - y;
  if (x !== null && y === null) return -1;
  if (x === null && y !== null) return 1;
  return natural(a, b);
}
