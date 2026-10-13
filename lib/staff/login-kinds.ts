/**
 * How a staff member signs in (profiles.login):
 *   personal  their own email
 *   shared    a check-in login for a division (a short name and a password)
 *   none      listed only: in the phone book and on their bunk, no sign-in
 */
export type LoginKind = "personal" | "shared" | "none";

/** Listed people without an email get a stand-in address nobody receives mail at. */
export const isPlaceholderEmail = (email: string | null | undefined) => Boolean(email && /^no-email\.[a-z0-9]+@/i.test(email));
/** The email to show: nothing for a stand-in address. */
export const shownEmail = (email: string | null | undefined) => (email && !isPlaceholderEmail(email) ? email : null);

/** "Division 1" → "division-1": the name check-in phones sign in with. */
export const checkinName = (divisionName: string) =>
  divisionName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "checkin";
export const isCheckinEmail = (email: string) => /^checkin\.[a-z0-9-]+@/.test(email);
/** "checkin.division-1@…" → "division-1". */
export const checkinNameOf = (email: string) => (isCheckinEmail(email) ? email.slice("checkin.".length, email.indexOf("@")) : null);

/** Three short words and a number: easy to read out and type on a phone. Works in the browser too. */
export function generatePassword() {
  const words = ["camp", "bunk", "sun", "lake", "tent", "fire", "pine", "trail", "star", "canoe", "hike", "song"];
  const r = globalThis.crypto.getRandomValues(new Uint16Array(3));
  return `${words[r[0] % words.length]}-${words[r[1] % words.length]}-${1000 + (r[2] % 9000)}`;
}

/** What a check-in login's name and password must look like; null when fine. */
export function checkinLoginProblem(name: string, password: string): string | null {
  if (checkinName(name).length < 2 || !/[a-z0-9]/i.test(name)) return "Give the login a name, e.g. division-1 or gate-2.";
  if (checkinName(name).length > 40) return "Keep the name under 40 characters.";
  if (password.length < 8) return "Use a password of at least 8 characters.";
  return null;
}
