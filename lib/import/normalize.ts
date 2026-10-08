const FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };

/** Mirrors `normalize_name()` in Postgres: lowercase, strip accents and niqqud, map Hebrew finals, collapse spaces. */
export function normalizeName(t: string | null | undefined): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/\s+/g, " ")
    .trim();
}

export function normText(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}
