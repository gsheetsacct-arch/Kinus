import type { CamperStatus } from "./machine";

export type MissingRules = {
  /** Flag stragglers once this share of their division has arrived (0 = off). */
  percent: number;
  /** Flag everyone still missing after this camp time, "HH:MM" (null = off). */
  after_time: string | null;
};
export const DEFAULT_RULES: MissingRules = { percent: 75, after_time: null };

type Row = { id: string; divisionId: string | null; bunkId: string | null; status: CamperStatus };
export type Followup = { until: string | null; note: string | null; by: string | null; at: string };
/** A division's campers (not counting "not coming") and how many of them have arrived. */
export type DivisionCount = { total: number; arrived: number };
/** Has anyone in the session arrived: no, yes (today), or "earlier" (a previous camp day). */
export type CampStart = boolean | "earlier";
export type MissingState =
  | { kind: "check"; reason: string } // flagged: someone should follow up
  | { kind: "later"; until: string } // coming later, flag paused until then
  | { kind: "waiting" }; // not here yet, nothing unusual

/** Arrived at some point (here now, out for a while, or already went home). */
const arrived = (s: CamperStatus) => s === "present" || s === "out" || s === "departed";

/**
 * Which campers still expected should be checked up on: most of their division is already
 * here, or it's past the cut-off time. Nothing is flagged by time before the first camper of
 * the session has arrived (`campStarted`; without it, judged from the rows given). Once camp
 * started on an earlier day, anyone still missing is past every cut-off: they don't look
 * "fine" again each morning.
 *
 * The share is of the whole division: `divisionCounts` (counted on the server for the whole
 * session) is used where the rows given are only part of a division (one bunk on screen, a
 * counselor who sees their own bunk); a division whose rows are all here is counted live.
 */
export function missingStates(
  rows: Row[],
  rules: MissingRules,
  followups: Map<string, Followup>,
  now: Date,
  campClock: string,
  campStarted?: CampStart,
  divisionCounts?: Record<string, DivisionCount>,
): Map<string, MissingState> {
  const groups = new Map<string, DivisionCount>();
  for (const r of rows) {
    const k = r.divisionId ?? "none";
    const g = groups.get(k) ?? { total: 0, arrived: 0 };
    if (r.status !== "no_show") g.total++;
    if (arrived(r.status)) g.arrived++;
    groups.set(k, g);
  }
  for (const [k, c] of Object.entries(divisionCounts ?? {})) {
    const local = groups.get(k);
    if (!local || c.total > local.total) groups.set(k, c);
  }
  // whether camp has started is a session-wide fact: a bunk that's all late still counts
  const anyArrived = campStarted === undefined ? rows.some((r) => arrived(r.status)) : Boolean(campStarted);
  const pastTime = Boolean(rules.after_time && anyArrived && (campStarted === "earlier" || campClock >= rules.after_time));
  const out = new Map<string, MissingState>();
  for (const r of rows) {
    if (r.status !== "expected") continue;
    const f = followups.get(r.id);
    if (f?.until && new Date(f.until) > now) {
      out.set(r.id, { kind: "later", until: f.until });
      continue;
    }
    const g = groups.get(r.divisionId ?? "none")!;
    const share = g.total ? (100 * g.arrived) / g.total : 0;
    const wasLater = f?.until ? " · was coming later" : "";
    if (rules.percent > 0 && g.arrived > 0 && share >= rules.percent) {
      out.set(r.id, { kind: "check", reason: `${g.arrived} of ${g.total} in their division have arrived${wasLater}` });
    } else if (pastTime) {
      out.set(r.id, { kind: "check", reason: (campStarted === "earlier" ? "Still not here since camp started" : `Still not here after ${rules.after_time}`) + wasLater });
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
