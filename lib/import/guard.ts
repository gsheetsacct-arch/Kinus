export type LostTextHit = { row: number; column: string; value: string };

const LOST = /\?{2,}/;

/**
 * Finds cells where text was replaced by runs of "?" — what happens when a file with
 * Hebrew/French is re-saved by WPS/Excel without Unicode. Such text is unrecoverable.
 */
export function findLostText(headers: string[], rows: Record<string, string>[]): LostTextHit[] {
  const hits: LostTextHit[] = [];
  rows.forEach((row, i) => {
    for (const h of headers) {
      const v = row[h];
      if (v && LOST.test(v)) hits.push({ row: i + 2, column: h, value: v });
    }
  });
  return hits;
}
