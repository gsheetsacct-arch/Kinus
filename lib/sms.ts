/** Text messages to staff: the parts the compose screen and the server share (no secrets here). */

/** Someone who may get a staff text: a staff member, or a sign-up from /updates who isn't one. */
export type TextRecipient = {
  key: string;
  profileId: string | null;
  name: string;
  phone: string | null; // +17185550100; null = no usable number
  /** Divisions they work in (empty for directors and office over all of camp, and sign-ups). */
  divisionIds: string[];
  optedOut: boolean;
  signup: boolean;
};

/**
 * Who a text goes to: everyone (divisionIds null), or the staff of those divisions. One text per
 * number (two staff sharing a phone, or a staff member who also signed up, get it once).
 * `skipped` are the people it can't go to: no number, or they replied STOP.
 */
export function pickRecipients(all: TextRecipient[], divisionIds: string[] | null) {
  const wanted = divisionIds ? new Set(divisionIds) : null;
  const inAudience = all.filter((r) => !wanted || r.divisionIds.some((d) => wanted.has(d)));
  const seen = new Set<string>();
  const to: TextRecipient[] = [];
  const skipped: (TextRecipient & { why: "no phone" | "opted out" })[] = [];
  // staff before sign-ups, so a shared number keeps the staff member's name
  for (const r of [...inAudience].sort((a, b) => Number(a.signup) - Number(b.signup))) {
    if (!r.phone) skipped.push({ ...r, why: "no phone" });
    else if (r.optedOut) skipped.push({ ...r, why: "opted out" });
    else if (!seen.has(r.phone)) {
      seen.add(r.phone);
      to.push(r);
    }
  }
  return { to, skipped };
}

// the GSM 03.38 alphabet (and its extension table, two characters each): anything else, such as
// Hebrew or an emoji, sends the whole message as UCS-2, 70 characters a text instead of 160
const GSM = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const GSM_EXT = new Set("^{}\\[~]|€");

/** How many texts a message is billed as (long messages are split, and each part counts). */
export function smsSegments(body: string): { segments: number; unicode: boolean; length: number } {
  const chars = [...body];
  const unicode = chars.some((c) => !GSM.has(c) && !GSM_EXT.has(c));
  if (unicode) {
    // UCS-2 counts UTF-16 units (an emoji is two)
    const length = body.length;
    return { segments: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67), unicode, length };
  }
  const length = chars.reduce((n, c) => n + (GSM_EXT.has(c) ? 2 : 1), 0);
  return { segments: length === 0 ? 0 : length <= 160 ? 1 : Math.ceil(length / 153), unicode, length };
}

/** A reply that stops texts (the words carriers and Twilio treat as opting out), or starts them again. */
export function optKeyword(body: string): "stop" | "start" | "help" | null {
  const w = body.trim().toUpperCase().replace(/[^A-Z ]/g, "").replace(/\s+/g, " ");
  if (["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "REVOKE"].includes(w)) return "stop";
  if (["START", "YES", "UNSTOP", "OPTIN", "OPT IN"].includes(w)) return "start";
  if (["HELP", "INFO"].includes(w)) return "help";
  return null;
}

/** Twilio's statuses in the order a message moves through them. Reports can arrive out of order: a status only replaces an earlier one. */
const STATUS_RANK: Record<string, number> = { queued: 0, accepted: 0, sending: 1, sent: 2, delivered: 3, undelivered: 3, failed: 3 };
export const laterStatus = (current: string, next: string) => next in STATUS_RANK && (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0);
