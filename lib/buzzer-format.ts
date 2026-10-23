/** A buzzer number as it's printed and shown: 7 → "007" (four digits from 1000). */
export function formatBuzzer(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n).padStart(3, "0");
}

/** A search that is a buzzer number ("7", "007"), or null. */
export function buzzerQuery(q: string): number | null {
  const t = q.trim().replace(/^#/, "");
  return /^\d{1,4}$/.test(t) ? Number(t) : null;
}
