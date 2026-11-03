import { describe, expect, it } from "vitest";
import { extraValue, humanLabel, parseExtraFields, shortAnswer } from "../extra-fields";

describe("extra fields", () => {
  it("names a column plainly", () => {
    expect(humanLabel("ppa.sleeping_at_the_kinus")).toBe("Sleeping at the kinus");
    expect(humanLabel("ppa#yarmulka_size")).toBe("Yarmulka size");
  });
  it("reads the value whichever way the column is written", () => {
    expect(extraValue({ "ppa#yarmulka_size": " 6 " }, "ppa.yarmulka_size")).toBe("6");
  });
  it("shows the short answer when one is set, else the answer as it is", () => {
    const [f] = parseExtraFields([{ column: "ppa.sleeping_at_the_kinus", label: "Sleeping", answers: { "Yes, at the Kinus (In the English speaking program, only available for Grades OLS, 4-7. Hebrew - all grades)": "Sleeps here" } }]);
    expect(shortAnswer(f, "Yes, at the Kinus (In the English speaking program,  only available for Grades OLS, 4-7. Hebrew - all grades)")).toBe("Sleeps here");
    expect(shortAnswer(f, "No, he will be picked up to sleep")).toBe("No, he will be picked up to sleep");
  });
});

describe("who sees an added column", () => {
  it("keeps a chosen group and drops an unknown one", async () => {
    const { parseExtraFields, chosenGroups } = await import("../extra-fields");
    const fields = parseExtraFields([
      { column: "family.situation", label: "Family situation", group: "family" },
      { column: "ppa.notes", label: "Notes", group: "nonsense" },
    ]);
    expect(fields[0].group).toBe("family");
    expect(fields[1].group).toBeUndefined();
    expect(chosenGroups(fields).get("family.situation")).toBe("family");
  });
  it("a chosen group wins over the guess from the name", async () => {
    const { groupOfKey } = await import("@/lib/fields");
    expect(groupOfKey("source.family.situation")).toBe("basic");
    expect(groupOfKey("source.Family#Situation", new Map([["family.situation", "family"]]))).toBe("family");
    // a medical-looking column can be opened to everyone
    expect(groupOfKey("source.ppa.diet", new Map([["ppa.diet", "basic"]]))).toBe("basic");
  });
});
