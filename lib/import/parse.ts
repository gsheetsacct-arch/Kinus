import * as XLSX from "xlsx";
import { decodeText } from "./decode";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
  encoding: string;
  sheetName: string;
  skippedEmptyRows: number;
  /** Column names the file uses more than once (each copy is kept: "family.city (2)"). */
  repeatedColumns?: string[];
};

const TEXT_EXT = /\.(csv|tsv|txt)$/i;

/** Reads .csv/.tsv/.txt (any supported encoding) or .xlsx/.xls into header + string rows. */
export function parseFile(input: Uint8Array, fileName: string): ParsedFile {
  let wb: XLSX.WorkBook;
  let encoding = "binary";
  if (TEXT_EXT.test(fileName)) {
    const d = decodeText(input);
    encoding = d.encoding;
    wb = XLSX.read(d.text, { type: "string", raw: true });
  } else {
    wb = XLSX.read(input, { type: "array", cellDates: false });
    encoding = "xlsx";
  }
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false, blankrows: false });
  if (grid.length === 0) return { headers: [], rows: [], encoding, sheetName, skippedEmptyRows: 0 };
  const headers = grid[0].map((h) => String(h ?? "").trim());
  // A name used for more than one column (exports repeat a block per family: family.city …
  // family.city): every copy is kept, as "family.city", "family.city (2)"…, and the plain name
  // holds the first copy with something in it. Before, the last copy won, empty or not, so a
  // camper with one family lost their city.
  const names = headers.map((h, i) => {
    if (!h) return "";
    const before = headers.slice(0, i).filter((x) => x === h).length;
    return before ? `${h} (${before + 1})` : h;
  });
  const repeated = [...new Set(headers.filter((h, i) => h && headers.indexOf(h) !== i))];
  const rows: Record<string, string>[] = [];
  let skipped = 0;
  for (const line of grid.slice(1)) {
    const cells = headers.map((_, i) => String(line[i] ?? "").trim());
    if (cells.every((c) => c === "")) {
      skipped++;
      continue;
    }
    const row: Record<string, string> = {};
    names.forEach((n, i) => {
      if (n !== "") row[n] = cells[i];
    });
    for (const h of repeated) {
      if (row[h] !== "") continue;
      const first = names.find((n, i) => headers[i] === h && row[n] !== "");
      if (first) row[h] = row[first];
    }
    rows.push(row);
  }
  return { headers: names.filter((h) => h !== ""), rows, encoding, sheetName, skippedEmptyRows: skipped, repeatedColumns: repeated };
}
