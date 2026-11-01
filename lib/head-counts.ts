/**
 * Head counts: a roll call that changes no one's check-in (a bus ride, a trip). Everyone
 * checked in ("here") in the count's divisions is expected; the count says who's been counted,
 * on which bus, and who's still missing. The parts the server and the counting screen share.
 */
import type { CamperStatus } from "@/lib/attendance/machine";

export type CountCamper = { id: string; name: string; last: string; code: string; divisionId: string | null; bunk: string | null; status: CamperStatus };
export type CountMark = { camperId: string; group: string | null; by: string | null; at: string; method: "scan" | "manual" };

/** Buses as typed: a number ("3" → Bus 1, Bus 2, Bus 3) or names one per line or comma; none for one bus. */
export function parseGroups(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (/^\d{1,2}$/.test(t)) {
    const n = Math.min(30, Number(t));
    return n > 1 ? Array.from({ length: n }, (_, i) => `Bus ${i + 1}`) : [];
  }
  const names = [...new Set(t.split(/[\n,]+/).map((s) => s.trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
  return names.length > 1 ? names : [];
}

/** Who's expected (checked in), who's been counted and where, and who's missing. */
export function summarize(campers: CountCamper[], marks: CountMark[], groups: string[]) {
  const marked = new Map(marks.map((m) => [m.camperId, m]));
  const expected = campers.filter((c) => c.status === "present");
  const missing = expected.filter((c) => !marked.has(c.id));
  const counted = campers.filter((c) => marked.has(c.id));
  // counted though not checked in (out, not here yet): they're here now, but say so
  const extra = counted.filter((c) => c.status !== "present");
  const byGroup = new Map<string, number>(groups.map((g) => [g, 0]));
  for (const m of marks) if (m.group && byGroup.has(m.group)) byGroup.set(m.group, (byGroup.get(m.group) ?? 0) + 1);
  return { expected: expected.length, counted: counted.length - extra.length, extra: extra.length, missing, byGroup };
}

/** Bunk, then last name: how missing kids are read out. */
export const byBunkThenName = (a: CountCamper, b: CountCamper) =>
  (a.bunk ?? "￿").localeCompare(b.bunk ?? "￿", undefined, { numeric: true }) || a.last.localeCompare(b.last) || a.name.localeCompare(b.name);
