import type { CamperStatus } from "./machine";

export type MissingRules = {
  /** Flag stragglers once this share of their bunk has arrived (0 = off). */
  percent: number;
  /** Flag everyone still missing after this camp time, "HH:MM" (null = off). */
  after_time: string | null;
};
export const DEFAULT_RULES: MissingRules = { percent: 75, after_time: null };

type Row = { id: string; divisionId: string | null; bunkId: string | null; status: CamperStatus };
export type Followup = { until: string | null; note: string | null; by: string | null; at: string };
export type MissingState =
  | { kind: "check"; reason: string } // flagged: someone should follow up
  | { kind: "later"; until: string } // coming later, flag paused until then
  | { kind: "waiting" }; // not here yet, nothing unusual

/** Arrived at some point (here now, out for a while, or already went home). */
const arrived = (s: CamperStatus) => s === "present" || s === "out" || s === "departed";

/**
 * Which campers still expected should be checked up on: most of their bunk (or
 * division, without a bunk) is already here, or it's past the cut-off time. Nothing is
 * flagged by time before the first camper of the session has arrived (`campStarted`;
 * without it, judged from the rows given).
 */
export function missingStates(rows: Row[], rules: MissingRules, followups: Map<string, Followup>, now: Date, campClock: string, campStarted?: boolean): Map<string, MissingState> {
  const groups = new Map<string, { total: number; arrived: number }>();
  for (const r of rows) {
    const k = r.bunkId ?? r.divisionId ?? "none";
    const g = groups.get(k) ?? { total: 0, arrived: 0 };
    if (r.status !== "no_show") g.total++;
    if (arrived(r.status)) g.arrived++;
    groups.set(k, g);
  }
  // whether camp has started is a session-wide fact: a bunk that's all late still counts
  const anyArrived = campStarted ?? rows.some((r) => arrived(r.status));
  const pastTime = Boolean(rules.after_time && anyArrived && campClock >= rules.after_time);
  const out = new Map<string, MissingState>();
  for (const r of rows) {
    if (r.status !== "expected") continue;
    const f = followups.get(r.id);
    if (f?.until && new Date(f.until) > now) {
      out.set(r.id, { kind: "later", until: f.until });
      continue;
    }
    const g = groups.get(r.bunkId ?? r.divisionId ?? "none")!;
    const share = g.total ? (100 * g.arrived) / g.total : 0;
    if (rules.percent > 0 && g.arrived > 0 && share >= rules.percent) {
      out.set(r.id, { kind: "check", reason: `${g.arrived} of ${g.total} in their ${r.bunkId ? "bunk" : "division"} are here` });
    } else if (pastTime) {
      out.set(r.id, { kind: "check", reason: `Still not here after ${rules.after_time}` });
    } else if (f?.until) {
      out.set(r.id, { kind: "check", reason: "Was coming later, still not here" });
    } else {
      out.set(r.id, { kind: "waiting" });
    }
  }
  return out;
}

/** "14:05" in camp time, for comparing with the cut-off. */
export function campClock(now: Date, timeZone: string): string {
  return now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
}
