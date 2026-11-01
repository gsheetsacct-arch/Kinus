import { compareBunkNames, compareDivisionNames } from "@/lib/bunk-order";

/** How tags print: by bunk (division, bunk, last name), by division (division, last name), or by last name. */
export type PrintOrder = "bunk" | "division" | "name";
export const PRINT_ORDERS: { value: PrintOrder; label: string }[] = [
  { value: "bunk", label: "By bunk" },
  { value: "division", label: "By division" },
  { value: "name", label: "By last name" },
];
export const parseOrder = (v: string | null | undefined): PrintOrder => (v === "division" || v === "name" ? v : "bunk");

type Tagged = { values: Record<string, string> };
const text = (p: Tagged, k: string) => p.values[k] ?? "";
const blankLast = (a: string, b: string) => Number(!a) - Number(!b);
const byLast = (a: Tagged, b: Tagged) => text(a, "LAST").localeCompare(text(b, "LAST")) || text(a, "FIRST").localeCompare(text(b, "FIRST"));
const byDivision = (a: Tagged, b: Tagged) => blankLast(text(a, "DIVISION"), text(b, "DIVISION")) || compareDivisionNames(text(a, "DIVISION"), text(b, "DIVISION"));
const byBunk = (a: Tagged, b: Tagged) => blankLast(text(a, "BUNK"), text(b, "BUNK")) || compareBunkNames(text(a, "BUNK"), text(b, "BUNK"));

/** Staff tags in an order: by name-tag division (then bunk), by division, or by last name; last name within. */
export function sortStaff<T extends Tagged>(people: T[], order: PrintOrder): T[] {
  const cmp = order === "name" ? byLast : order === "division" ? (a: T, b: T) => byDivision(a, b) || byLast(a, b) : (a: T, b: T) => byDivision(a, b) || byBunk(a, b) || byLast(a, b);
  return [...people].sort(cmp);
}
