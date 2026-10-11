"use server";
import { z } from "zod";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { appUrl } from "@/lib/auth/app-url";
import { decide, type OutKind } from "@/lib/attendance/scan";
import { STATUS_LABEL, type AttendanceEventType, type CamperStatus } from "@/lib/attendance/machine";
import { visibleFieldGroups } from "@/lib/auth/permissions";
import { createPrintJob, processPrintJob } from "@/lib/print/jobs";
import { errorMessage, fail, ok, type ActionResult } from "@/lib/actions/result";

export type ScanOutcome =
  | { ok: true; kind: "act"; camperId: string; name: string; status: CamperStatus; eventId: string; verb: string; tone: "in" | "out" | "home"; autoPrinted: string[] }
  | { ok: true; kind: "already" | "blocked"; camperId: string; name: string; status: CamperStatus; message: string; since: string | null; by: string | null }
  | { ok: false; error: string };

const friendly = (e: unknown) => {
  const m = errorMessage(e);
  if (/not allowed/i.test(m)) return "This camper isn't in your area.";
  if (/invalid transition/i.test(m)) return "Someone just changed this camper. Look them up to see where they are.";
  return m;
};

/** Templates marked "print on first check-in", requested once per camper. */
async function autoPrintOnFirstArrival(camperId: string, sessionId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { count } = await admin.from("attendance_events").select("id", { count: "exact", head: true }).eq("camper_id", camperId).eq("event_type", "arrival");
  if (count !== 1) return [];
  const { data: templates } = await admin.from("print_templates").select("id, name").eq("auto_on_first_checkin", true);
  if (!templates?.length) return [];
  const user = await requireUser();
  const base = await appUrl();
  const names: string[] = [];
  for (const t of templates) {
    try {
      const job = await createPrintJob(user, { sessionId, templateId: t.id, camperIds: [camperId], note: "Automatic on first check-in" });
      after(() => processPrintJob(job.id, base));
      names.push(t.name);
    } catch {
      // a failed automatic print never blocks a check-in
    }
  }
  return names;
}

/** One scan or tap in Check in / Check out mode. */
export async function scanCamper(camperId: string, mode: "in" | "out", outKind: OutKind, method: "scan" | "manual"): Promise<ScanOutcome> {
  await requireUser();
  const supabase = await createClient();
  const { data: c } = await supabase.from("campers_board").select("id, display_name, status, session_id, last_event_at, last_event_by").eq("id", camperId).maybeSingle();
  if (!c?.id) return { ok: false, error: "This camper isn't in your area." };
  const d = decide(mode, outKind, c.status!);
  if (d.kind !== "act") return { ok: true, kind: d.kind, camperId: c.id, name: c.display_name ?? "", status: c.status!, message: d.message, since: c.last_event_at, by: c.last_event_by };
  // someone had marked them "not coming": say so, so the helper can tell the head counselor
  const verb = c.status === "no_show" ? `${d.verb} (was marked not coming)` : d.verb;
  const r = await record(c.id, c.display_name ?? "", c.session_id!, d.event, method, verb, d.tone);
  if (r.ok || !r.changedMeanwhile) return r;
  // the other helper at the gate scanned the same kid a split second earlier: say what they did
  const { data: now } = await supabase.from("campers_board").select("status, last_event_at, last_event_by").eq("id", camperId).maybeSingle();
  if (!now?.status) return r;
  const again = decide(mode, outKind, now.status);
  if (again.kind === "act") return r;
  return { ok: true, kind: again.kind, camperId: c.id, name: c.display_name ?? "", status: now.status, message: again.message, since: now.last_event_at, by: now.last_event_by };
}

/** A button on the camper card. */
export async function recordFromCard(camperId: string, event: AttendanceEventType, note?: string): Promise<ScanOutcome> {
  await requireUser();
  const supabase = await createClient();
  const { data: c } = await supabase.from("campers_board").select("id, display_name, session_id").eq("id", camperId).maybeSingle();
  if (!c?.id) return { ok: false, error: "This camper isn't in your area." };
  const verb = event === "arrival" ? "Checked in" : event === "return" ? "Back in" : event === "pickup" ? "Checked out · not coming back" : "Checked out · coming back";
  const tone = event === "pickup" ? "home" : event === "leave" ? "out" : "in";
  return record(c.id, c.display_name ?? "", c.session_id!, event, "manual", verb, tone, note);
}

async function record(
  camperId: string,
  name: string,
  sessionId: string,
  event: AttendanceEventType,
  method: "scan" | "manual",
  verb: string,
  tone: "in" | "out" | "home",
  note?: string,
): Promise<ScanOutcome & { changedMeanwhile?: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_attendance", { p_camper_id: camperId, p_event_type: event, p_method: method, p_note: note || undefined });
  if (error || !data) return { ok: false, error: friendly(error), changedMeanwhile: /invalid transition/i.test(errorMessage(error)) };
  const ev = data as { id: string; resulting_status: CamperStatus };
  const autoPrinted = event === "arrival" ? await autoPrintOnFirstArrival(camperId, sessionId) : [];
  // no revalidatePath: Who's here is rendered fresh on every visit, and revalidating would
  // send the whole Check in page back with every scan (~50 KB of a gate phone's data)
  return { ok: true, kind: "act", camperId, name, status: ev.resulting_status, eventId: ev.id, verb, tone, autoPrinted };
}

export async function undoScan(eventId: string): Promise<{ ok: true; status: CamperStatus } | { ok: false; error: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_attendance", { p_event_id: eventId });
  if (error || !data) return { ok: false, error: errorMessage(error) };
  return { ok: true, status: (data as { resulting_status: CamperStatus }).resulting_status };
}

/** Director correction: set the status directly, with a reason. */
export async function correctStatus(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const camperId = String(fd.get("camper_id") ?? "");
  const status = String(fd.get("status") ?? "") as CamperStatus;
  const note = String(fd.get("note") ?? "").trim();
  if (!(status in STATUS_LABEL)) return fail("Pick a status.");
  if (!note) return fail("Say why, so others understand the change.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_attendance", { p_camper_id: camperId, p_event_type: "correction", p_method: "manual", p_note: note, p_force_status: status });
  if (error) return fail(/not allowed/i.test(error.message) ? "Only directors can correct a status." : errorMessage(error));
  revalidatePath(`/campers/${camperId}`);
  revalidatePath("/status");
  return ok(`Now ${STATUS_LABEL[status].toLowerCase()}.`);
}

export type CardData = {
  id: string;
  name: string;
  code: string;
  division: string | null;
  bunk: string | null;
  status: CamperStatus;
  since: string | null;
  by: string | null;
  medicalFlag: boolean;
  contacts: { label: string; name: string | null; phone: string | null; tel: string | null }[] | null;
  prints: Record<string, { status: string; at: string; by: string | null }>;
};

const ROLE_LABEL: Record<string, string> = { mother: "Mother", father: "Father", guardian: "Guardian", emergency: "Emergency", host: "Host", authorized_pickup: "Pickup" };

export async function loadCard(camperId: string): Promise<CardData | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: c }, { data: fv }, { data: contacts }, { data: prints }] = await Promise.all([
    supabase.from("campers_board").select("*").eq("id", camperId).maybeSingle(),
    supabase.from("field_visibility").select("field_group, roles"),
    supabase.from("camper_contacts").select("role, slot, name, phone, phone_e164").eq("camper_id", camperId).order("role").order("slot"),
    supabase.rpc("camper_print_status", { p_camper_id: camperId }),
  ]);
  if (!c?.id) return null;
  const [{ data: d }, { data: b }] = await Promise.all([
    c.division_id ? supabase.from("divisions").select("name").eq("id", c.division_id).maybeSingle() : Promise.resolve({ data: null }),
    c.bunk_id ? supabase.from("bunks").select("name").eq("id", c.bunk_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const seeContacts = visibleFieldGroups(user, fv ?? []).has("contacts");
  return {
    id: c.id,
    name: c.display_name ?? "",
    code: c.camper_code ?? "",
    division: d?.name ?? null,
    bunk: b?.name ?? null,
    status: c.status!,
    since: c.last_event_at,
    by: c.last_event_by,
    medicalFlag: Boolean(c.has_medical_flag),
    contacts: seeContacts
      ? (contacts ?? []).map((k) => ({ label: `${ROLE_LABEL[k.role] ?? k.role}${k.role === "emergency" ? ` ${k.slot}` : ""}`, name: k.name, phone: k.phone, tel: k.phone_e164 ?? k.phone }))
      : null,
    prints: Object.fromEntries((prints ?? []).filter((p) => p.template_id).map((p) => [p.template_id!, { status: p.printed_at ? "printed" : p.status, at: p.printed_at ?? p.requested_at, by: p.requested_by_name }])),
  };
}

/** One-tap print request from a camper card (name tag, luggage tag, …). */
export async function requestTag(camperId: string, templateId: string, opts: { copies?: number; deliverTo?: string } = {}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };
  const deliverTo = opts.deliverTo?.trim() || undefined;
  if (deliverTo && !z.email().safeParse(deliverTo).success) return { ok: false, error: `“${deliverTo}” isn't an email address.` };
  const copies = Math.min(10, Math.max(1, Math.round(Number(opts.copies ?? 1)) || 1));
  try {
    const job = await createPrintJob(user, { sessionId: session.id, templateId, camperIds: [camperId], copies, deliverTo });
    const base = await appUrl();
    after(() => processPrintJob(job.id, base));
    return { ok: true, message: `${copies > 1 ? `${copies} copies sent` : "Sent"} to ${deliverTo ?? "the office"}.` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Fresh statuses for the scan screen's roster (polled). */
export async function rosterStatuses(): Promise<Record<string, CamperStatus>> {
  await requireUser();
  const session = await getActiveSession();
  if (!session) return {};
  const supabase = await createClient();
  const { fetchAll } = await import("@/lib/supabase/fetch-all");
  const rows = await fetchAll((from, to) => supabase.from("campers").select("id, status").eq("session_id", session.id).is("archived_at", null).order("id").range(from, to));
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

export type CodeLookup =
  | { found: true; entry: { id: string; code: string; name: string; first: string; last: string; where: string; status: CamperStatus } }
  | { found: false; message: string };

/**
 * A code the Check in page doesn't have: a walk-in added after the page loaded (then it's
 * returned and checked in), or a child at the wrong line (then say which line).
 */
export async function lookupCode(code: string): Promise<CodeLookup> {
  await requireUser();
  const session = await getActiveSession();
  if (!session || !/^\d{6}$/.test(code)) return { found: false, message: "No camper has this code." };
  const supabase = await createClient();
  const { data: mine } = await supabase
    .from("campers")
    .select("id, camper_code, first_name, last_name, status, divisions(name), bunks(name)")
    .eq("session_id", session.id)
    .eq("camper_code", code)
    .is("archived_at", null)
    .maybeSingle();
  if (mine) {
    const where = [(mine.divisions as { name: string } | null)?.name, (mine.bunks as { name: string } | null)?.name ?? "no bunk"].filter(Boolean).join(" · ");
    return { found: true, entry: { id: mine.id, code: mine.camper_code, name: `${mine.first_name} ${mine.last_name}`, first: mine.first_name, last: mine.last_name, where, status: mine.status } };
  }
  // outside this person's area: only say where they check in, nothing else about them
  const { data: other } = await createAdminClient().from("campers").select("archived_at, divisions(name)").eq("session_id", session.id).eq("camper_code", code).maybeSingle();
  if (!other) return { found: false, message: "No camper has this code. Check the tag, or type the name." };
  if (other.archived_at) return { found: false, message: "This camper was archived. Send them to the office." };
  const division = (other.divisions as { name: string } | null)?.name;
  return { found: false, message: division ? `Wrong line: this camper checks in with ${division}.` : "This camper has no division yet. Send them to the office." };
}
