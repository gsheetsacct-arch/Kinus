import "server-only";
import { isAdmin, textableDivisionIds, type CurrentUser } from "@/lib/auth/permissions";
import type { TextRecipient } from "@/lib/sms";

type Reply = { profile_id?: string | null; phone_e164: string };

/**
 * Who sees a text someone sent back: the head staff of the sender's own division and up
 * (its division head, kloli and head counselors, directors over that part of camp, directors
 * over all of camp), never another division's or camp's. A reply from someone in no division
 * (a sign-up, staff over all of camp, an unknown number) is for directors over all of camp.
 *
 * `recipients`: everyone texts go to (loadTextRecipients), which says each person's divisions.
 */
export function replyVisibility(me: CurrentUser, recipients: TextRecipient[]): (r: Reply) => boolean {
  if (isAdmin(me)) return () => true;
  const allowed = textableDivisionIds(me);
  if (allowed === null) return () => true;
  const mine = new Set(allowed);
  const byProfile = new Map(recipients.filter((x) => x.profileId).map((x) => [x.profileId!, x.divisionIds]));
  const byPhone = new Map<string, string[]>();
  for (const x of recipients) if (x.phone && !x.signup) byPhone.set(x.phone, [...(byPhone.get(x.phone) ?? []), ...x.divisionIds]);
  return (r) => ((r.profile_id ? byProfile.get(r.profile_id) : null) ?? byPhone.get(r.phone_e164) ?? []).some((d) => mine.has(d));
}
