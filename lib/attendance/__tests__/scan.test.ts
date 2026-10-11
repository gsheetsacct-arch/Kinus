import { describe, it, expect } from "vitest";
import { decide, parseScan, cardActions, findScanCode, looksLikeScan } from "../scan";
import { nextStatus } from "../machine";

describe("decide", () => {
  it("check in mode", () => {
    expect(decide("in", "back", "expected")).toMatchObject({ kind: "act", event: "arrival" });
    expect(decide("in", "back", "out")).toMatchObject({ kind: "act", event: "return" });
    expect(decide("in", "back", "present")).toMatchObject({ kind: "already" });
    expect(decide("in", "back", "departed")).toMatchObject({ kind: "act", event: "arrival", verb: "Checked in again" });
  });
  it("check out mode, coming back vs going home", () => {
    expect(decide("out", "back", "present")).toMatchObject({ kind: "act", event: "leave" });
    expect(decide("out", "back", "out")).toMatchObject({ kind: "already" });
    expect(decide("out", "home", "present")).toMatchObject({ kind: "act", event: "pickup" });
    expect(decide("out", "home", "out")).toMatchObject({ kind: "act", event: "pickup" });
    expect(decide("out", "home", "expected")).toMatchObject({ kind: "blocked" });
    expect(decide("out", "back", "departed")).toMatchObject({ kind: "already" });
  });
  it("every action it chooses is a valid transition", () => {
    for (const mode of ["in", "out"] as const)
      for (const out of ["back", "home"] as const)
        for (const s of ["expected", "present", "out", "departed", "no_show"] as const) {
          const d = decide(mode, out, s);
          if (d.kind === "act") expect(nextStatus(s, d.event)).not.toBeNull();
        }
    for (const s of ["expected", "present", "out", "departed", "no_show"] as const) for (const a of cardActions(s)) expect(nextStatus(s, a.event)).not.toBeNull();
  });
});

describe("parseScan", () => {
  it("reads camper codes from barcodes and typing", () => {
    expect(parseScan("KN100016")).toBe("100016");
    expect(parseScan("kn 100016")).toBe("100016");
    expect(parseScan("100016")).toBe("100016");
    expect(parseScan("Levi")).toBeNull();
    expect(parseScan("KN1000")).toBeNull();
  });
});

describe("findScanCode", () => {
  it("finds a good scan after junk left in the box", () => {
    expect(findScanCode("KN12AB9KN106518")).toBe("106518");
    expect(findScanCode("KN106518")).toBe("106518");
    expect(findScanCode("106518")).toBe("106518");
  });
  it("never takes 6 digits out of a longer number or a garbled read", () => {
    expect(findScanCode("12345678")).toBeNull();
    expect(findScanCode("KN12AB9")).toBeNull();
    expect(findScanCode("Levi Cohen")).toBeNull();
  });
  it("tells a damaged tag read from a name", () => {
    expect(looksLikeScan("KN12AB9")).toBe(true);
    expect(looksLikeScan("Levi Cohen")).toBe(false);
    expect(looksLikeScan("levi")).toBe(false);
  });
});
