/**
 * Final check-outs set up by directors (Final check-out → Set up): each has a name, the camps it
 * covers (one or more: "American & French") and who may use it (every account, or some kinds:
 * roles, and check-in logins). Anyone it's for who works in one of its camps checks out any
 * camper of all its camps. Several can run at once (American & French at one door, Hebrew at
 * another). Kept in settings ("final_checkouts"); the database reads the same list to allow
 * the check-out (migration 0069, my_checkout_divisions).
 */
export const FINAL_CHECKOUTS_KEY = "final_checkouts";

/** Who: "all" accounts, or these kinds: staff roles (personal accounts) and "checkin_login" (the shared check-in phones). */
export type CheckoutWho = "all" | string[];
export type CheckoutSetup = { id: string; name: string; camps: string[]; who: CheckoutWho };

export const CHECKIN_LOGIN = "checkin_login";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The saved list, cleaned (anything malformed is left out). */
export function parseSetups(value: unknown): CheckoutSetup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): CheckoutSetup[] => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    const camps = Array.isArray(o.camps) ? o.camps.filter((c): c is string => typeof c === "string" && UUID.test(c)) : [];
    const who: CheckoutWho = o.who === "all" ? "all" : Array.isArray(o.who) ? o.who.filter((r): r is string => typeof r === "string") : [];
    if (typeof o.id !== "string" || !camps.length) return [];
    return [{ id: o.id, name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 60) : "Final check-out", camps, who }];
  });
}

/** Whether a final check-out is for this account (by role, or as a check-in login). */
export function setupIsFor(setup: CheckoutSetup, who: { role: string; checkinLogin: boolean }): boolean {
  if (setup.who === "all") return true;
  return who.checkinLogin ? setup.who.includes(CHECKIN_LOGIN) : setup.who.includes(who.role);
}

/**
 * The camps this account checks out in: every camp of each final check-out that is for them
 * and covers a camp they work in (`myCamps`).
 */
export function checkoutCampsFor(setups: CheckoutSetup[], who: { role: string; checkinLogin: boolean }, myCamps: string[]): string[] {
  const mine = new Set(myCamps);
  return [...new Set(setups.filter((s) => setupIsFor(s, who) && s.camps.some((c) => mine.has(c))).flatMap((s) => s.camps))];
}
