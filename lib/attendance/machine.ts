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

/** The one name for each status, on every page (tiles, badges, filters, buttons, lists). */
export const STATUS_LABEL: Record<CamperStatus, string> = {
  expected: "Not here yet",
  present: "Here",
  out: "Out, coming back",
  departed: "Not coming back",
  no_show: "Not coming",
};

export const EVENT_LABEL: Record<AttendanceEventType, string> = {
  arrival: "Checked in",
  leave: "Checked out · coming back",
  return: "Back in",
  pickup: "Checked out · not coming back",
  no_show: "Marked not coming",
  correction: "Status corrected",
};
