import type { AttendanceEventType, CamperStatus } from "./machine";

export type ScanMode = "in" | "out" | "lookup";
export type OutKind = "back" | "home";
export type ScanDecision =
  | { kind: "act"; event: AttendanceEventType; verb: string; tone: "in" | "out" | "home" }
  | { kind: "already"; message: string }
  | { kind: "blocked"; message: string };

/** What one scan does, given the screen's mode and the camper's current status. */
export function decide(mode: Exclude<ScanMode, "lookup">, outKind: OutKind, status: CamperStatus): ScanDecision {
  if (mode === "in") {
    if (status === "present") return { kind: "already", message: "Already checked in" };
    if (status === "out") return { kind: "act", event: "return", verb: "Back in", tone: "in" };
    return { kind: "act", event: "arrival", verb: status === "departed" ? "Checked in again" : "Checked in", tone: "in" };
  }
  if (status === "expected" || status === "no_show") return { kind: "blocked", message: "Hasn't checked in yet" };
  if (status === "departed") return { kind: "already", message: "Already checked out, not coming back" };
  if (outKind === "home") return { kind: "act", event: "pickup", verb: "Checked out · not coming back", tone: "home" };
  if (status === "out") return { kind: "already", message: "Already checked out" };
  return { kind: "act", event: "leave", verb: "Checked out · coming back", tone: "out" };
}

/** Camper code from a scanned barcode or typed text: "KN100016", "kn 100016", "100016". */
export function parseScan(text: string): string | null {
  const t = text.trim().replace(/\s+/g, "");
  const m = /^(?:KN)?0*(\d{6})$/i.exec(t);
  return m ? m[1] : null;
}

/**
 * The code in what a scanner typed, also when junk came first ("KN12AB9KN106518": a damaged
 * read left in the box, then a good scan). Never takes 6 digits out of a longer number.
 */
export function findScanCode(text: string): string | null {
  const t = text.trim().replace(/\s+/g, "");
  return parseScan(t) ?? /(?:^|\D)(?:KN)?0*(\d{6})$/i.exec(t)?.[1] ?? null;
}

/** Looks like a (damaged) tag read rather than a name being typed. */
export const looksLikeScan = (text: string) => !/\s/.test(text.trim()) && text.trim().length >= 5 && /\d/.test(text);

/** Which buttons a camper card shows for a status. */
export function cardActions(status: CamperStatus): { event: AttendanceEventType; label: string; tone: "in" | "out" | "home" }[] {
  switch (status) {
    case "expected":
    case "no_show":
      return [{ event: "arrival", label: "Check in", tone: "in" }];
    case "present":
      return [
        { event: "leave", label: "Check out · coming back", tone: "out" },
        { event: "pickup", label: "Not coming back", tone: "home" },
      ];
    case "out":
      return [
        { event: "return", label: "Back in", tone: "in" },
        { event: "pickup", label: "Not coming back", tone: "home" },
      ];
    case "departed":
      return [{ event: "arrival", label: "Check in again", tone: "in" }];
  }
}
