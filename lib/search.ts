import { normalizeName } from "@/lib/import/normalize";

export type SearchEntry = { name: string; words: string[]; keys: string[]; code: string; phones: string; buzzer: number | null };

/** Precomputes what a camper can be found by: name in any order/language, code, parent phone digits, buzzer number. */
export function searchEntry(name: string, code: string, phones: string[] = [], buzzer: number | null = null): SearchEntry {
  const n = normalizeName(name);
  const words = n.split(" ").filter(Boolean);
  return { name: n, words, keys: words.map(soundKey), code, phones: phones.map((p) => p.replace(/\D/g, "")).join(" "), buzzer };
}

/**
 * How well `q` matches (0 = not at all). Every word typed must start a word of the name
 * ("levi coh" finds "Cohen, Levi"); or the code starts with it; or 4+ digits end a parent phone.
 * Exact matches score 1–3. Below 1: a name that sounds the same or is a typo or two away
 * ("Menahem", "Shneor", "Frideman"): staff at the gate spell names as they hear them.
 */
export function matchScore(e: SearchEntry, q: string): number {
  // the tag's barcode reads "KN100180"; a USB scanner types exactly that
  const raw = q.trim().replace(/^kn(?=\d)/i, "");
  if (!raw) return 1;
  const digits = raw.replace(/\D/g, "");
  if (digits && digits.length === raw.replace(/[\s()+-]/g, "").length) {
    if (e.code.startsWith(digits)) return 3;
    // the buzzer's number (7, 007)
    if (digits.length <= 4 && e.buzzer !== null && Number(digits) === e.buzzer) return 2.5;
    if (digits.length >= 4 && e.phones.split(" ").some((p) => p.endsWith(digits) || (digits.length >= 7 && p.includes(digits)))) return 2;
    return 0;
  }
  const needle = normalizeName(raw);
  if (e.name.startsWith(needle)) return 3;
  const parts = needle.split(" ").filter(Boolean);
  if (parts.every((p) => e.words.some((w) => w.startsWith(p)))) return 2;
  if (needle.length >= 3 && e.name.includes(needle)) return 1;
  return similarScore(e, parts);
}

/**
 * Each word typed against the name's words: how close the nearest one is (0 = none). All words
 * typed must be close to some word of the name; the score stays under 1, after exact matches.
 */
function similarScore(e: SearchEntry, parts: string[]): number {
  if (!parts.length || parts.join("").length < 3) return 0;
  let total = 0;
  for (const p of parts) {
    const pk = soundKey(p);
    let best = 0;
    e.words.forEach((w, i) => {
      if (w.startsWith(p)) best = Math.max(best, 1);
      // sounds the same: Chaim / Haim, Menachem / Menahem, Tzvi / Zvi, מענדל / מנדל
      else if (pk.length >= 2 && (e.keys[i] === pk || (pk.length >= 3 && p.length >= 4 && e.keys[i].startsWith(pk)))) best = Math.max(best, 0.85);
      else {
        // a typo or two: missing, extra, wrong or swapped letters (also while still typing)
        const allowed = p.length <= 3 ? 0 : p.length <= 6 ? 1 : 2;
        if (!allowed) return;
        const d = Math.min(editDistance(p, w, allowed), w.length > p.length ? editDistance(p, w.slice(0, p.length), allowed) : allowed + 1);
        if (d <= allowed) best = Math.max(best, 0.75 - 0.1 * d);
      }
    });
    if (!best) return 0;
    total += best;
  }
  return Math.min(0.95, (total / parts.length) * 0.9);
}

/**
 * How a name sounds, roughly, so spellings of the same name meet: Chaim / Haim / Khaim,
 * Tzvi / Zvi, Shneur / Schneur / Shneor, Moishe / Moshe, Dovid / David, Rivkah / Rifka.
 * Its first letter, then its consonants (vowels dropped, doubles once). Hebrew: without the
 * letters that are often left out or added (א ה ו י ע), after the first.
 */
export function soundKey(word: string): string {
  const w = normalizeName(word).replace(/[^\p{L}]/gu, "");
  if (!w) return "";
  if (/[֐-׿]/.test(w)) return w[0] + w.slice(1).replace(/[אהויע]/g, "").replace(/(.)\1+/g, "$1");
  const s = w
    .replace(/sch/g, "sh")
    .replace(/t[sz]/g, "z")
    .replace(/[ck]h/g, "h")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/[cq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/[vw]/g, "f")
    .replace(/^y/, "i")
    .replace(/j/g, "i");
  // the first letter (Y as I: Yitzchak / Itzchak), then consonants; a final h after a vowel is silent
  const rest = s.slice(1).replace(/([aeiouy])h$/, "$1").replace(/[aeiouy]/g, "");
  const first = s[0];
  return (first + rest).replace(/(.)\1+/g, "$1");
}

/** Letters to change to turn a into b (a swap of two letters is one), or max + 1 once over max. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      row.push(v);
      low = Math.min(low, v);
    }
    if (low > max) return max + 1;
    rows.push(row);
  }
  return Math.min(rows[a.length][b.length], max + 1);
}
