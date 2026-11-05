import type { CamperStatus } from "./machine";

/** When a camper still missing is flagged: one rule, for camp, a camp or a division. */
export type MissingRule = {
  /** Flag stragglers once this share of their division has arrived (0 = off). */
  percent: number;
  /** Flag everyone still missing after this camp time, "HH:MM" (null = off). */
  after_time: string | null;
  /** …on this camp date, "YYYY-MM-DD" (null: the time on the day camp starts, as before). */
  after_date?: string | null;
};
/** A camp's or a division's own rule (key "camp:<id>" or "div:<id>"), as saved in Settings. */
export type MissingOverride = MissingRule & { key: string };
export type MissingRules = MissingRule & {
  overrides?: MissingOverride[];
  /** Each division's rule where it isn't the general one (its own, else its camp's): worked out on loading. */
  byDivision?: Record<string, MissingRule>;
};
export const DEFAULT_RULES: MissingRules = { percent: 75, after_time: null, after_date: null };

/** "1 Nov 10:30" for a dated cut-off, "10:30" for a time alone. */
export const cutoffLabel = (r: MissingRule) =>
  r.after_date ? `${new Date(`${r.after_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}${r.after_time ? ` ${r.after_time}` : ""}` : (r.after_time ?? "");

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
  // camp time now: "HH:MM", or "YYYY-MM-DD HH:MM" (campNow) for dated cut-offs
  const clock = campClock.slice(-5);
  const today = campClock.length > 5 ? campClock.slice(0, 10) : null;
  // past a rule's cut-off: a dated one from that moment on (whether or not anyone arrived yet);
  // a time alone, as before, once camp has started (and every day after the first)
  const pastFor = (rule: MissingRule) => {
    if (rule.after_date) return Boolean(today && `${today} ${clock}` >= `${rule.after_date} ${rule.after_time ?? "00:00"}`);
    return Boolean(rule.after_time && anyArrived && (campStarted === "earlier" || clock >= rule.after_time));
  };
  const ruleOf = (divisionId: string | null): MissingRule => (divisionId && rules.byDivision?.[divisionId]) || rules;
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
    const rule = ruleOf(r.divisionId);
    if (rule.percent > 0 && g.arrived > 0 && share >= rule.percent) {
      out.set(r.id, { kind: "check", reason: `${g.arrived} of ${g.total} in their division have arrived${wasLater}` });
    } else if (pastFor(rule)) {
      out.set(r.id, { kind: "check", reason: (!rule.after_date && campStarted === "earlier" ? "Still not here since camp started" : `Still not here after ${cutoffLabel(rule)}`) + wasLater });
    } else if (f?.until) {
      out.set(r.id, { kind: "check", reason: "Was coming later, still not here" });
    } else {
      out.set(r.id, { kind: "waiting" });
    }
  }
  return out;
}

/** "2026-11-05 14:05" in camp time: the day and time, for dated cut-offs (missingStates takes either). */
export function campNow(now: Date, timeZone: string): string {
  const day = now.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone });
  return `${day} ${campClock(now, timeZone)}`;
}

/**
 * Each division's own rule where it differs: its own override, else its camp's (a division with
 * no camp is in the first, as everywhere). The general rule covers the rest.
 */
export function rulesByDivision(overrides: MissingOverride[] | undefined, divisions: { id: string; group_id: string | null }[], firstCamp: string | null): Record<string, MissingRule> {
  const by = new Map((overrides ?? []).map((o) => [o.key, o]));
  const out: Record<string, MissingRule> = {};
  for (const d of divisions) {
    const o = by.get(`div:${d.id}`) ?? by.get(`camp:${d.group_id ?? firstCamp}`);
    if (o) out[d.id] = { percent: o.percent, after_time: o.after_time, after_date: o.after_date ?? null };
  }
  return out;
}

/** "14:05" in camp time, for comparing with the cut-off. */
export function campClock(now: Date, timeZone: string): string {
  return now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
}
