"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/current-user";
import { decide } from "@/lib/attendance/scan";
import type { CamperStatus } from "@/lib/attendance/machine";
import { checkoutScope } from "@/lib/attendance/final-checkout";
import { errorMessage } from "@/lib/actions/result";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { CodeLookup, ScanOutcome } from "@/app/(app)/scan/actions";

/**
 * Final check-out: "gone home" for a camper of any division of the camp. The camper is read
 * with the service role (a check-in login only sees its own division in lists), and only after
 * checking they're in this person's camp; recording goes through the database as the person,
 * which checks the same again (migration 0029).
 */
async function camperInScope(camperId: string) {
  const user = await requireUser();
  const scope = await checkoutScope(user);
  if (!scope) return { error: "Your account can't do final check-out." } as const;
  // the campers table (the board view shows only what the signed-in person may see)
  const { data: row } = await createAdminClient()
    .from("campers")
    .select("id, first_name, last_name, status, session_id, division_id, archived_at, last_event_id")
    .eq("id", camperId)
    .maybeSingle();
  if (!row || !scope.divisions.some((d) => d.id === row.division_id)) return { error: `This camper isn't in ${scope.campName}.` } as const;
  const c = { ...row, display_name: `${row.first_name} ${row.last_name}`, ...(await lastEvent(row.last_event_id)) };
  if (c.archived_at) return { error: "This camper was archived. Send them to the office." } as const;
  if (c.session_id !== scope.sessionId) return { error: "This page is from an earlier session. Reload it." } as const;
  return { c, scope } as const;
}

/** When the camper's last check-in or out was, and who recorded it ("Already gone home · 3:12 by Sarah"). */
async function lastEvent(id: string | null): Promise<{ last_event_at: string | null; last_event_by: string | null }> {
  if (!id) return { last_event_at: null, last_event_by: null };
  const admin = createAdminClient();
  const { data: e } = await admin.from("attendance_events").select("occurred_at, recorded_by").eq("id", id).maybeSingle();
  if (!e) return { last_event_at: null, last_event_by: null };
  const { data: p } = e.recorded_by ? await admin.from("profiles").select("full_name").eq("id", e.recorded_by).maybeSingle() : { data: null };
  return { last_event_at: e.occurred_at, last_event_by: p?.full_name ?? null };
}

export async function finalCheckout(camperId: string, method: "scan" | "manual"): Promise<ScanOutcome> {
  const found = await camperInScope(camperId);
  if ("error" in found) return { ok: false, error: found.error! };
  const { c } = found;
  const said = (status: CamperStatus, since: string | null, by: string | null) => {
    const d = decide("out", "home", status);
    // never arrived: nothing to check out (say so plainly, it's often a camper who stayed home)
    const message = d.kind === "act" ? "" : status === "expected" || status === "no_show" ? "Never checked in this session" : d.message;
    return { ok: true as const, kind: d.kind === "blocked" ? ("blocked" as const) : ("already" as const), camperId: c.id, name: c.display_name ?? "", status, message, since, by };
  };
  const d = decide("out", "home", c.status);
  if (d.kind !== "act") return said(c.status, c.last_event_at, c.last_event_by);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_attendance", { p_camper_id: c.id, p_event_type: "pickup", p_method: method });
  if (error || !data) {
    const m = errorMessage(error);
    if (/invalid transition/i.test(m)) {
      // the next phone over scanned them a moment earlier: say what happened
      const { data: now } = await createAdminClient().from("campers").select("status, last_event_id").eq("id", c.id).maybeSingle();
      if (now?.status) {
        const e = await lastEvent(now.last_event_id);
        return said(now.status, e.last_event_at, e.last_event_by);
      }
    }
    return { ok: false, error: /not allowed/i.test(m) ? "Your account can't check this camper out." : m };
  }
  const ev = data as { id: string; resulting_status: CamperStatus };
  return { ok: true, kind: "act", camperId: c.id, name: c.display_name ?? "", status: ev.resulting_status, eventId: ev.id, verb: "Gone home", tone: "home", autoPrinted: [] };
}

/** Everyone's status in the camp, to keep the page's counts fresh. */
export async function checkoutStatuses(): Promise<Record<string, CamperStatus>> {
  const scope = await checkoutScope(await requireUser());
  if (!scope) return {};
  const admin = createAdminClient();
  const ids = scope.divisions.map((d) => d.id);
  const rows = await fetchAll((from, to) =>
    admin.from("campers").select("id, status").eq("session_id", scope.sessionId).in("division_id", ids).is("archived_at", null).order("id").range(from, to),
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

/** A code that isn't on the page (a camper added since it loaded). */
export async function lookupCheckoutCode(code: string): Promise<CodeLookup> {
  const scope = await checkoutScope(await requireUser());
  if (!scope || !/^\d{6}$/.test(code)) return { found: false, message: "No camper has this code." };
  const { data: c } = await createAdminClient()
    .from("campers")
    .select("id, camper_code, first_name, last_name, status, division_id, archived_at, divisions(name), bunks(name)")
    .eq("session_id", scope.sessionId)
    .eq("camper_code", code)
    .maybeSingle();
  if (!c) return { found: false, message: "No camper has this code." };
  if (c.archived_at) return { found: false, message: "This camper was archived. Send them to the office." };
  if (!scope.divisions.some((d) => d.id === c.division_id)) return { found: false, message: `Not in ${scope.campName}: ${(c.divisions as { name: string } | null)?.name ?? "no division"}.` };
  const where = [(c.divisions as { name: string } | null)?.name, (c.bunks as { name: string } | null)?.name ?? "no bunk"].filter(Boolean).join(" · ");
  return { found: true, entry: { id: c.id, code: c.camper_code, name: `${c.first_name} ${c.last_name}`, first: c.first_name, last: c.last_name, where, status: c.status, div: c.division_id } };
}
