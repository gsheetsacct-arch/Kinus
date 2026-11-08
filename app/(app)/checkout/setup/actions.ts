"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser, getActiveSession } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { errorMessage } from "@/lib/actions/result";
import { CHECKIN_LOGIN, FINAL_CHECKOUTS_KEY, parseSetups, type CheckoutSetup } from "@/lib/checkout/setups";
import { ROLE_ORDER } from "@/lib/labels";

async function load() {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", FINAL_CHECKOUTS_KEY).maybeSingle();
  return parseSetups(data?.value);
}

async function store(list: CheckoutSetup[], by: string) {
  const { error } = await createAdminClient()
    .from("settings")
    .upsert({ key: FINAL_CHECKOUTS_KEY, value: list as never, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw error;
  revalidatePath("/checkout");
  revalidatePath("/checkout/setup");
}

/** Creates (no id) or changes a final check-out: its name, camps and who may use it. Directors over all of camp. */
export async function saveCheckoutSetup(input: { id?: string; name: string; camps: string[]; who: "all" | string[] }): Promise<ActionResult> {
  const me = await requireUser();
  if (!isAdmin(me)) return fail("Only the owner and directors over all of camp set up final check-out.");
  try {
    const session = await getActiveSession();
    if (!session) return fail("There's no active session.");
    const { data: groups } = await createAdminClient().from("division_groups").select("id").eq("session_id", session.id);
    const known = new Set((groups ?? []).map((g) => g.id));
    const camps = [...new Set(input.camps)].filter((c) => known.has(c));
    if (!camps.length) return fail("Pick at least one camp.");
    const kinds = new Set<string>([...ROLE_ORDER, CHECKIN_LOGIN]);
    const who = input.who === "all" ? "all" : [...new Set(input.who)].filter((w) => kinds.has(w));
    if (who !== "all" && !who.length) return fail("Pick who can use it: every account, or at least one kind.");
    const name = input.name.trim().slice(0, 60) || "Final check-out";
    const list = await load();
    const setup: CheckoutSetup = { id: input.id && list.some((s) => s.id === input.id) ? input.id : randomUUID(), name, camps, who };
    await store(list.some((s) => s.id === setup.id) ? list.map((s) => (s.id === setup.id ? setup : s)) : [...list, setup], me.id);
    return ok(input.id ? `Saved “${name}”.` : `“${name}” is set up.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Ends a final check-out: nobody it was for can check out with it any more. */
export async function deleteCheckoutSetup(id: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!isAdmin(me)) return fail("Only the owner and directors over all of camp set up final check-out.");
  try {
    const list = await load();
    const gone = list.find((s) => s.id === id);
    if (!gone) return fail("That final check-out is already gone. Reload the page.");
    await store(list.filter((s) => s.id !== id), me.id);
    return ok(`“${gone.name}” is removed.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
