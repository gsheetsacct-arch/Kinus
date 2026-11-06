import { describe, expect, it } from "vitest";
import { allowedTextRoles, textRuleFor } from "../text-rules";

describe("who may text whom", () => {
  it("defaults to head staff texting any role; owners always", () => {
    expect(textRuleFor(null, "kloli")).toEqual({ can: true, roles: null });
    expect(textRuleFor(null, "counselor").can).toBe(false);
    expect(textRuleFor({ owner: { can: false } }, "owner")).toEqual({ can: true, roles: null });
  });
  it("a role set to text only klolis can't reach anyone else", () => {
    const rule = textRuleFor({ kloli: { can: true, roles: ["kloli"] } }, "kloli");
    expect(allowedTextRoles(rule, null)).toEqual(["kloli"]);
    expect(allowedTextRoles(rule, ["counselor", "kloli"])).toEqual(["kloli"]);
    expect(allowedTextRoles(rule, ["counselor"])).toEqual([]);
    expect(allowedTextRoles(textRuleFor(null, "director"), ["counselor"])).toEqual(["counselor"]);
  });
});
