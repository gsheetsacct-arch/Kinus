export { ORGANIZATION, PROGRAM } from "@/lib/update-signups";
export const UPDATED = "October 29, 2026";

/** Where people write with questions about the texts, the privacy policy and the terms. */
export const CONTACT_EMAIL = "kinus@youngshluchim.org";

/** The contact address on the sign-up page, the privacy policy and the terms. */
export async function contactEmail(): Promise<string> {
  return CONTACT_EMAIL;
}
