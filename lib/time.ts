import { CAMP_TIME_ZONE } from "./utils";

/** Today's date in camp, "YYYY-MM-DD". */
export const campToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: CAMP_TIME_ZONE });

/** The zone's UTC offset at an instant, e.g. "-04:00". */
function offsetAt(instant: Date): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: CAMP_TIME_ZONE, timeZoneName: "shortOffset" }).formatToParts(instant).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "+00:00";
}

/** A camp wall-clock time ("2026-07-01", "16:30") as an ISO instant, daylight saving included. */
export function campDateTimeToIso(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  // the offset on that day (checked near the time itself, so DST changes land right)
  return new Date(`${date}T${time}:00${offsetAt(guess)}`).toISOString();
}

/** Start of today in camp time, as an ISO instant. */
export const startOfCampDay = (now = new Date()) => campDateTimeToIso(campToday(now), "00:00");
