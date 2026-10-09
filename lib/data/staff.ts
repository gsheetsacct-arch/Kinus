import { createAdminClient } from "@/lib/supabase/admin";

export type SignInInfo = { lastSignInAt: string | null; invitedAt: string | null; confirmed: boolean };

/** Sign-in status from Supabase Auth (service role, server only). */
export async function signInInfo(): Promise<Map<string, SignInInfo>> {
  const out = new Map<string, SignInInfo>();
  try {
    const admin = createAdminClient();
    for (let page = 1; page < 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data.users.length) break;
      for (const u of data.users) out.set(u.id, { lastSignInAt: u.last_sign_in_at ?? null, invitedAt: u.invited_at ?? null, confirmed: Boolean(u.email_confirmed_at) });
      if (data.users.length < 200) break;
    }
  } catch {
    // status is a nicety; the page works without it
  }
  return out;
}

export function statusOf(active: boolean, info: SignInInfo | undefined): { label: string; variant: "success" | "warning" | "destructive" | "outline" } {
  if (!active) return { label: "Deactivated", variant: "destructive" };
  if (!info) return { label: "Active", variant: "success" };
  if (!info.lastSignInAt) return { label: "Invited · hasn't signed in", variant: "warning" };
  return { label: "Active", variant: "success" };
}
