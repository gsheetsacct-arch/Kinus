import { describe, expect, it } from "vitest";
import { isListKey } from "../list-keys";

describe("fields a list layout can use", () => {
  const own = (k: string) => k === "grade";
  it("takes export columns with any name, spaces too", () => {
    expect(isListKey("source.ppa.sleeping_at_the_kinus", own)).toBe(true);
    expect(isListKey("source.Bus Number", own)).toBe(true);
    expect(isListKey("source.מספר אוטובוס", own)).toBe(true);
    expect(isListKey("grade", own)).toBe(true);
  });
  it("refuses what isn't a field", () => {
    expect(isListKey("source.", own)).toBe(false);
    expect(isListKey("source.   ", own)).toBe(false);
    expect(isListKey("source.{{x}}", own)).toBe(false);
    expect(isListKey("display_name; drop", own)).toBe(false);
  });
});
