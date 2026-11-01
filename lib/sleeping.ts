import { parseFixes, withFixes } from "@/lib/source-fixes";

/**
 * Who sleeps at the Kinus and who goes home: the registration's "Sleeping At The Kinus" column
 * (ppa.sleeping_at_the_kinus, however the export spells it), with the office's fixes. Yes →
 * true, No → false; not answered → left out. Read with the server's key, only for campers the
 * page already found (it says nothing else about them).
 */
const isSleepingColumn = (k: string) => k.toLowerCase().replace(/[^a-z]/g, "").endsWith("sleepingatthekinus");

export function sleepingAnswer(v: unknown): boolean | null {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^(y|yes|true|1|sleeping|staying)\b/.test(t)) return true;
  if (/^(n|no|false|0|not|going home|home)\b/.test(t)) return false;
  return null;
}

export function sleepingOf(sourceData: unknown, fixes: unknown): boolean | null {
  const row = withFixes(sourceData, parseFixes(fixes));
  for (const [k, v] of Object.entries(row)) if (isSleepingColumn(k)) return sleepingAnswer(v);
  return null;
}


/** The list column (Lists, list layouts): "Sleeping here" or "Going home", from the same answer. */
export const SLEEPING_COLUMN = "sleeping";
export const SLEEPING_COLUMN_LABEL = "Sleeping at the Kinus";
export const sleepingText = (v: boolean | null | undefined) => (v === true ? "Sleeping here" : v === false ? "Going home" : null);
