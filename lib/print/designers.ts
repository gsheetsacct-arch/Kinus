import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, type CurrentUser } from "@/lib/auth/permissions";

/**
 * Who may make and change the label templates, fields and conversions: directors over all
 * of camp, and the staff they've allowed (settings "template_designers" → [profile ids]).
 * Kept in settings, so allowing someone needs no database change. Their changes are
 * written with the server's key after this check (the database itself only lets
 * directors over all of camp change templates).
 */
export const loadDesigners = cache(async (): Promise<string[]> => {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "template_designers").maybeSingle();
  return Array.isArray(data?.value) ? (data.value as unknown[]).filter((x): x is string => typeof x === "string") : [];
});

export async function canDesign(user: CurrentUser): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (user.checkinLogin) return false;
  return (await loadDesigners()).includes(user.id);
}

export async function saveDesigners(ids: string[], by: string): Promise<void> {
  const clean = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))];
  const { error } = await createAdminClient()
    .from("settings")
    .upsert({ key: "template_designers", value: clean, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw error;
}
