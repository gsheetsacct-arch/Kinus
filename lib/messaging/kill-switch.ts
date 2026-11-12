import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The owner's kill switch for texting (Text staff, owners only): while it's on, Kinus sends no
 * texts at all (staff texts, the updates sign-up's welcome text), whoever asks. Replies still
 * come in. A settings row, so no database change.
 */
export const TEXTING_OFF_KEY = "texting_off";

export type TextingOff = { off: boolean; by?: string; at?: string };

export async function textingOff(): Promise<TextingOff> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", TEXTING_OFF_KEY).maybeSingle();
  const v = (data?.value ?? null) as TextingOff | null;
  return v && v.off ? v : { off: false };
}
