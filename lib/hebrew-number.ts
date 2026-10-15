import { hebrewNumberToken } from "./bunk-order";

/**
 * Bunk (and other) numbers between their spellings: "Bunk Yud Alef", "יא", "י״א" and "11"
 * are all 11. Used by the "Hebrew letters / numbers" conversion on merge fields.
 */

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת"];

/** 11 → "יא", 15 → "טו", 16 → "טז", 115 → "קטו"; with marks: "י״א", "א׳". 1–999. */
export function toHebrewNumeral(n: number, marks = false): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  let h = Math.floor(n / 100);
  let s = "";
  while (h > 4) {
    s += "ת";
    h -= 4;
  }
  s += HUNDREDS[h];
  const rest = n % 100;
  // 15 and 16 are written 9+6 and 9+7, never spelling a name of God
  if (rest === 15) s += "טו";
  else if (rest === 16) s += "טז";
  else s += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  if (!marks) return s;
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
}

const TOKEN = /[^\s\-_/.,:'"`״׳()]+/g;

/**
 * Where a number is in a text, and its value: the first run of Hebrew-letter words or
 * letters ("Yud Alef", "י״א"), or else the first digits. Null when there's none.
 */
export function findNumber(text: string): { value: number; start: number; end: number } | null {
  const tokens = [...text.normalize("NFC").matchAll(TOKEN)].map((m) => ({ t: m[0], start: m.index!, end: m.index! + m[0].length }));
  for (let i = 0; i < tokens.length; i++) {
    if (hebrewNumberToken(tokens[i].t) === null) continue;
    let value = 0;
    let j = i;
    while (j < tokens.length && hebrewNumberToken(tokens[j].t) !== null) value += hebrewNumberToken(tokens[j++].t)!;
    return { value, start: tokens[i].start, end: tokens[j - 1].end };
  }
  const d = /\d+/.exec(text);
  return d ? { value: Number(d[0]), start: d.index, end: d.index + d[0].length } : null;
}

export type NumberStyle = "number" | "hebrew" | "hebrew_marks";

/**
 * The number in a text written another way: "Bunk Yud Alef" → "11" or "יא". With `keepWords`
 * only the number changes ("Bunk Yud Alef" → "Bunk 11"). Text without a number is left as it is.
 */
export function convertNumber(text: string, to: NumberStyle, keepWords = false): string {
  const t = text.normalize("NFC");
  const found = findNumber(t);
  if (!found) return text;
  const out = to === "number" ? String(found.value) : toHebrewNumeral(found.value, to === "hebrew_marks");
  return keepWords ? `${t.slice(0, found.start)}${out}${t.slice(found.end)}` : out;
}
