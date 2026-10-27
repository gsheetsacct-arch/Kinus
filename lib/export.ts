import "server-only";
import { NextResponse } from "next/server";
import { attachment } from "@/lib/utils";

export type ExportFormat = "csv" | "xlsx";
type Cell = string | number | boolean | null | undefined;

/** "xlsx" when asked for Excel, else CSV. */
export const exportFormat = (v: string | null): ExportFormat => (v === "xlsx" ? "xlsx" : "csv");

const text = (v: Cell) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
const csvCell = (v: Cell) => {
  const s = text(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * A table (first row the column names) as a download: CSV with a UTF-8 BOM, so Excel opens
 * Hebrew and French correctly, or an Excel workbook. Everything stays text in Excel too, so
 * codes and phone numbers keep their leading zeros ("0012", "054…").
 */
export async function tableDownload(name: string, rows: Cell[][], format: ExportFormat): Promise<NextResponse> {
  const file = name.replace(/[\\/:*?"<>|]+/g, "_");
  const headers = { "Cache-Control": "private, no-store" };
  if (format === "csv") {
    const body = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return new NextResponse(body, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(`${file}.csv`) } });
  }
  const XLSX = await import("xlsx");
  const grid = rows.map((r) => r.map(text));
  const ws = XLSX.utils.aoa_to_sheet(grid);
  // column widths from the longest value (capped)
  ws["!cols"] = (grid[0] ?? []).map((_, i) => ({ wch: Math.min(50, Math.max(6, ...grid.map((r) => (r[i] ?? "").length + 1))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, file.replace(/[[\]]/g, "").slice(0, 31) || "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": attachment(`${file}.xlsx`) },
  });
}
