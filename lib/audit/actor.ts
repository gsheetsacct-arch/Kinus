import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";

/** Who a change is made for, and where on the site: written with it to the activity log. */
export type Actor = { id: string; via?: string | null };

const acting = new AsyncLocalStorage<Actor>();

/** Run fn as this person (the design connector, which has no sign-in cookie). */
export const actingAs = <T>(actor: Actor, fn: () => T): T => acting.run(actor, fn);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signed-in person of this request, from their session (no extra round trip), once per request. */
const fromSession = cache(async (): Promise<Actor | null> => {
  try {
    const [{ createClient }, { headers }] = await Promise.all([import("@/lib/supabase/server"), import("next/headers")]);
    const [supabase, h] = await Promise.all([createClient(), headers()]);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return null;
    const sub = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString())?.sub;
    if (typeof sub !== "string" || !UUID.test(sub)) return null;
    return { id: sub, via: pageOf(h.get("referer")) ?? h.get("x-kinus-path") };
  } catch {
    // outside a request (scheduled jobs, tests): nobody
    return null;
  }
});

/** "/campers/abc?tab=edit" from a full address. */
export function pageOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`.slice(0, 200);
  } catch {
    return null;
  }
}

/**
 * Who the server is acting for now: the connector's person when set, else whoever is signed
 * in. The admin client sends it with each change, so the log names them (migration 0052).
 */
export async function currentActor(): Promise<Actor | null> {
  return acting.getStore() ?? (await fromSession());
}
