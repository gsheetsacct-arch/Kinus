import type { CamperStatus } from "./machine";

export type BoardScope = { kind: "all" } | { kind: "group"; id: string } | { kind: "division"; id: string } | { kind: "bunk"; divisionId: string; id: string };
export type Counts = Record<CamperStatus, number> & { total: number };
type Tree = { groups: { id: string; name: string }[]; divisions: { id: string; name: string; group_id: string | null; bunks: { id: string; name: string }[] }[] };
type Row = { divisionId: string | null; bunkId: string | null; status: CamperStatus };

export const emptyCounts = (): Counts => ({ expected: 0, present: 0, out: 0, departed: 0, no_show: 0, total: 0 });
export function countStatuses(rows: { status: CamperStatus }[]): Counts {
  const c = emptyCounts();
  for (const r of rows) {
    c[r.status]++;
    c.total++;
  }
  return c;
}

export const encodeScope = (s: BoardScope) => (s.kind === "all" ? "all" : s.kind === "bunk" ? `b:${s.divisionId}:${s.id}` : `${s.kind[0]}:${s.id}`);
export function decodeScope(v: string | null | undefined): BoardScope | null {
  if (!v) return null;
  if (v === "all") return { kind: "all" };
  const [k, a, b] = v.split(":");
  if (k === "g" && a) return { kind: "group", id: a };
  if (k === "d" && a) return { kind: "division", id: a };
  if (k === "b" && a && b) return { kind: "bunk", divisionId: a, id: b };
  return null;
}

/** Whether a scope still exists in the tree (a remembered choice may be from last summer). */
export function scopeExists(s: BoardScope, tree: Tree): boolean {
  if (s.kind === "all") return true;
  if (s.kind === "group") return tree.groups.some((g) => g.id === s.id);
  if (s.kind === "division") return tree.divisions.some((d) => d.id === s.id);
  return tree.divisions.some((d) => d.id === s.divisionId && d.bunks.some((b) => b.id === s.id));
}

export function inScope<R extends Row>(r: R, s: BoardScope, tree: Tree): boolean {
  if (s.kind === "all") return true;
  if (s.kind === "division") return r.divisionId === s.id;
  if (s.kind === "bunk") return r.bunkId === s.id;
  const d = tree.divisions.find((x) => x.id === r.divisionId);
  return d?.group_id === s.id;
}

/**
 * The natural first view for someone: their only bunk, their only division, else everything they see.
 * `coverage` is the user's areas expanded to divisions (empty when they see all of camp).
 */
export function defaultScope(coverage: { division_id: string; bunk_id: string | null }[], tree: Tree): BoardScope {
  if (!coverage.length) return { kind: "all" };
  const divisions = [...new Set(coverage.map((c) => c.division_id))].filter((id) => tree.divisions.some((d) => d.id === id));
  if (divisions.length !== 1) return { kind: "all" };
  const whole = coverage.some((c) => c.division_id === divisions[0] && c.bunk_id === null);
  const bunks = [...new Set(coverage.filter((c) => c.bunk_id).map((c) => c.bunk_id!))];
  if (!whole && bunks.length === 1) return { kind: "bunk", divisionId: divisions[0], id: bunks[0] };
  return { kind: "division", id: divisions[0] };
}

export type BoardGroup<R> = { key: string; title: string; subtitle?: string; rows: R[]; counts: Counts };

/** Bunks inside one division or bunk; divisions otherwise. Campers without a bunk/division last. */
export function groupRows<R extends Row>(rows: R[], s: BoardScope, tree: Tree): BoardGroup<R>[] {
  const byBunk = s.kind === "division" || s.kind === "bunk";
  const order: { key: string; title: string; subtitle?: string }[] = [];
  if (byBunk) {
    const d = tree.divisions.find((x) => x.id === (s.kind === "division" ? s.id : s.divisionId));
    for (const b of d?.bunks ?? []) order.push({ key: b.id, title: b.name });
  } else {
    for (const d of tree.divisions) order.push({ key: d.id, title: d.name });
  }
  const buckets = new Map<string, R[]>();
  for (const r of rows) {
    const k = (byBunk ? r.bunkId : r.divisionId) ?? "none";
    const list = buckets.get(k) ?? [];
    list.push(r);
    buckets.set(k, list);
  }
  const out: BoardGroup<R>[] = [];
  for (const o of order) {
    const list = buckets.get(o.key);
    if (list?.length) out.push({ ...o, rows: list, counts: countStatuses(list) });
    buckets.delete(o.key);
  }
  for (const [k, list] of buckets) out.push({ key: k, title: k === "none" ? (byBunk ? "No bunk yet" : "No division") : "Other", rows: list, counts: countStatuses(list) });
  return out;
}
