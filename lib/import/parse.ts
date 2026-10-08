import * as XLSX from "xlsx";
import { decodeText } from "./decode";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
  encoding: string;
  sheetName: string;
  skippedEmptyRows: number;
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
  const rows: Record<string, string>[] = [];
  let skipped = 0;
  for (const line of grid.slice(1)) {
    const cells = headers.map((_, i) => String(line[i] ?? "").trim());
    if (cells.every((c) => c === "")) {
      skipped++;
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h !== "") row[h] = cells[i];
    });
    rows.push(row);
  }
  return { headers: headers.filter((h) => h !== ""), rows, encoding, sheetName, skippedEmptyRows: skipped };
}
