import { describe, expect, it } from "vitest";
import { checkoutCampsFor, parseSetups, setupIsFor } from "../setups";

const AM = "11111111-1111-4111-8111-111111111111";
const FR = "22222222-2222-4222-8222-222222222222";
const HE = "33333333-3333-4333-8333-333333333333";

describe("final check-out setups", () => {
  const setups = parseSetups([
    { id: "a", name: "American & French", camps: [AM, FR], who: ["scanner", "checkin_login"] },
    { id: "b", name: "Hebrew", camps: [HE], who: "all" },
    { id: "bad", camps: [] },
    "junk",
  ]);
  it("reads the saved list, leaving out what's malformed", () => {
    expect(setups.map((s) => s.id)).toEqual(["a", "b"]);
  });
  it("is for the kinds picked: roles for people, check-in logins apart", () => {
    expect(setupIsFor(setups[0], { role: "scanner", checkinLogin: false })).toBe(true);
    expect(setupIsFor(setups[0], { role: "counselor", checkinLogin: false })).toBe(false);
    expect(setupIsFor(setups[0], { role: "scanner", checkinLogin: true })).toBe(true);
    expect(setupIsFor(setups[1], { role: "counselor", checkinLogin: false })).toBe(true);
  });
  it("covers every camp of a check-out when the account works in one of them", () => {
    expect(checkoutCampsFor(setups, { role: "scanner", checkinLogin: false }, [FR]).sort()).toEqual([AM, FR].sort());
    expect(checkoutCampsFor(setups, { role: "counselor", checkinLogin: false }, [AM])).toEqual([]);
    expect(checkoutCampsFor(setups, { role: "counselor", checkinLogin: false }, [HE])).toEqual([HE]);
    expect(checkoutCampsFor(setups, { role: "scanner", checkinLogin: true }, [HE, AM]).sort()).toEqual([AM, FR, HE].sort());
  });
});
