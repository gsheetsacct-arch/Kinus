import { describe, expect, it } from "vitest";
import { parseGroups, summarize, type CountCamper, type CountMark } from "../head-counts";

const kid = (id: string, status: CountCamper["status"] = "present"): CountCamper => ({ id, name: id, last: id, code: "0001", divisionId: "d", bunk: null, status });
const mark = (camperId: string, group: string | null = null): CountMark => ({ camperId, group, by: null, at: "", method: "scan" });

describe("head counts", () => {
  it("reads the buses: a number, names, or one bus", () => {
    expect(parseGroups("3")).toEqual(["Bus 1", "Bus 2", "Bus 3"]);
    expect(parseGroups("Yellow bus, Blue bus")).toEqual(["Yellow bus", "Blue bus"]);
    expect(parseGroups("1")).toEqual([]);
    expect(parseGroups("")).toEqual([]);
    expect(parseGroups("Only bus")).toEqual([]);
  });

  it("expects the kids checked in, counts each once, and lists who's missing", () => {
    const campers = [kid("a"), kid("b"), kid("c"), kid("away", "out"), kid("gone", "departed")];
    const s = summarize(campers, [mark("a", "Bus 1"), mark("b", "Bus 2"), mark("away", "Bus 2")], ["Bus 1", "Bus 2"]);
    expect(s.expected).toBe(3);
    expect(s.counted).toBe(2);
    // "away" was out but got on the bus: counted, flagged as not checked in
    expect(s.extra).toBe(1);
    expect(s.missing.map((c) => c.id)).toEqual(["c"]);
    expect([...s.byGroup]).toEqual([
      ["Bus 1", 1],
      ["Bus 2", 2],
    ]);
  });
});
