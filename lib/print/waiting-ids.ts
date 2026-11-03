import "server-only";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
import { queueScope, waitingSets } from "./queue";

/**
 * ?waiting=<label size>[&camp=…][&division=…]: every on-the-spot label of that size still to
 * print in that part of the queue (worked out here, so the address stays short however many
 * there are). Null when this person can't use the print queue.
 */
export async function waitingIds(sp: URLSearchParams): Promise<string[] | null> {
  const [user, session] = await Promise.all([getCurrentUser(), getActiveSession()]);
  if (!user || !session || !canUsePrintArea(user)) return null;
  const { shows } = await queueScope(user, session.id, { camp: sp.get("camp"), division: sp.get("division") });
  const sets = await waitingSets(session.id, shows);
  return sets.find((s) => s.key === sp.get("waiting"))?.ids ?? [];
}
