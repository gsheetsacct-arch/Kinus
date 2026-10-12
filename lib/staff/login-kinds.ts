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
