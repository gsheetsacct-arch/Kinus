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
