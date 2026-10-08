import type { Database } from "@/lib/supabase/database.types";

export type CamperStatus = Database["public"]["Enums"]["camper_status"];
export type AttendanceEventType = Database["public"]["Enums"]["attendance_event_type"];

/** Mirrors the transition table inside `record_attendance()`. */
export function nextStatus(current: CamperStatus, event: AttendanceEventType, force?: CamperStatus): CamperStatus | null {
  switch (event) {
    case "arrival":
      return ["expected", "departed", "no_show"].includes(current) ? "present" : null;
    case "leave":
      return current === "present" ? "out" : null;
    case "return":
      return current === "out" ? "present" : null;
    case "pickup":
      return current === "present" || current === "out" ? "departed" : null;
    case "no_show":
      return current === "expected" ? "no_show" : null;
    case "correction":
      return force ?? null;
  }
}

export const STATUS_LABEL: Record<CamperStatus, string> = {
  expected: "Expected",
  present: "Present",
  out: "Out",
  departed: "Departed",
  no_show: "No-show",
};
