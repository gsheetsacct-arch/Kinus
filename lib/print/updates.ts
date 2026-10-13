import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { loadMergeSetup, loadPrintCampers, toSpec, byBunkThenName } from "./data";
import { mergeValues } from "./merge";
import { contentHash, sameContent, templateKeys } from "./content";

/**
 * Labels to print again after a print was done: campers whose details on the label changed
 * since it was printed, and new campers in divisions whose labels were already printed.
 *
 * - "Printed" means marked printed. A camper with the label still waiting (queued, ready,
 *   emailed) is left out: that print shows the current details anyway.
 * - New campers count only where that division was mostly printed already (a batch), so one
 *   name tag asked for from a camper card doesn't make the whole camp "new".
 * - "Not needed" remembers what the label said then; it comes back only if it changes again.
 */
export type UpdateCamper = { id: string; name: string; where: string };
export type LabelUpdate = { templateId: string; templateName: string; changed: UpdateCamper[]; fresh: UpdateCamper[] };

/** A division counts as printed once this share of its campers have the label. */
const PRINTED_DIVISION = 0.5;
const PENDING = new Set(["queued", "rendering", "ready", "sent"]);
/** A request still waiting after this long was likely printed from the email and never marked: it no longer hides the camper. */
const PENDING_FOR_MS = 2 * 24 * 3600_000;

type Dismissed = Record<string, Record<string, string>>;

/** "Not needed" answers, one settings row per template ("label_updates_dismissed:<template>"). */
export async function loadDismissed(): Promise<Dismissed> {
  const { data } = await createAdminClient().from("settings").select("key, value").like("key", "label_updates_dismissed:%");
  return Object.fromEntries((data ?? []).map((r) => [r.key.slice("label_updates_dismissed:".length), (r.value ?? {}) as Record<string, string>]));
}

export async function labelUpdates(sessionId: string, divisionIds: string[] | null, only?: string): Promise<LabelUpdate[]> {
  const admin = createAdminClient();
  let tq = admin.from("print_templates").select("*").not("name", "like", "(retired)%");
  if (only) tq = tq.eq("id", only);
  const { data: templates, error } = await tq;
  if (error) throw error;
  if (!templates?.length) return [];
  const history = await fetchAll((from, to) =>
    admin
      .from("print_job_items")
      .select("job_id, camper_id, content_hash, print_jobs!inner(template_id, status, requested_at, printed_at, session_id)")
      .eq("print_jobs.session_id", sessionId)
      .in("print_jobs.template_id", templates.map((t) => t.id))
      .not("print_jobs.status", "in", "(cancelled,failed)")
      .order("camper_id")
      .order("job_id")
      .range(from, to),
  );
  // per template: each camper's latest printed label, and who has one waiting
  const printed = new Map<string, Map<string, { at: string; hash: string | null; jobId: string }>>();
  const pending = new Map<string, Set<string>>();
  for (const h of history) {
    const j = h.print_jobs as unknown as { template_id: string; status: string; requested_at: string; printed_at: string | null };
    if (PENDING.has(j.status) && Date.now() - Date.parse(j.requested_at) < PENDING_FOR_MS) {
      pending.set(j.template_id, (pending.get(j.template_id) ?? new Set()).add(h.camper_id));
      continue;
    }
    if (j.status !== "printed") continue;
    const at = j.printed_at ?? j.requested_at;
    const m = printed.get(j.template_id) ?? new Map();
    const cur = m.get(h.camper_id);
    if (!cur || at > cur.at) m.set(h.camper_id, { at, hash: h.content_hash, jobId: h.job_id });
    printed.set(j.template_id, m);
  }
  const used = templates.filter((t) => printed.get(t.id)?.size);
  if (!used.length) return [];

  const campers = await fetchAll((from, to) => {
    let q = admin.from("campers").select("id, division_id").eq("session_id", sessionId).is("archived_at", null);
    if (divisionIds) q = q.in("division_id", divisionIds);
    return q.order("id").range(from, to);
  });
  if (!campers.length) return [];
  const [full, setup, dismissed] = await Promise.all([loadPrintCampers(admin, campers.map((c) => c.id)), loadMergeSetup(admin), loadDismissed()]);
  full.sort(byBunkThenName);
  const values = new Map(full.map((c) => [c.id, mergeValues(c, setup.fields, setup.maps)]));
  const divisionOf = new Map(campers.map((c) => [c.id, c.division_id]));
  const perDivision = new Map<string | null, number>();
  for (const c of campers) perDivision.set(c.division_id, (perDivision.get(c.division_id) ?? 0) + 1);
  const who = (c: (typeof full)[number]): UpdateCamper => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, where: [c.division_name, c.bunk_name].filter(Boolean).join(" · ") });

  // labels printed with the older one-piece fingerprint, found unchanged, get per-field ones
  // (so a field added to the template later isn't mistaken for every camper changing)
  const upgrades: { job_id: string; camper_id: string; was: string; content_hash: string }[] = [];
  const result = used
    .map((t) => {
      const keys = templateKeys(toSpec(t));
      const done = printed.get(t.id)!;
      const waiting = pending.get(t.id) ?? new Set<string>();
      const skip = dismissed[t.id] ?? {};
      const printedIn = new Map<string | null, number>();
      for (const id of done.keys()) if (divisionOf.has(id)) printedIn.set(divisionOf.get(id)!, (printedIn.get(divisionOf.get(id)!) ?? 0) + 1);
      const changed: UpdateCamper[] = [];
      const fresh: UpdateCamper[] = [];
      for (const c of full) {
        if (waiting.has(c.id)) continue;
        const vals = values.get(c.id)!;
        if (skip[c.id] && sameContent(skip[c.id], keys, vals)) continue;
        const was = done.get(c.id);
        if (was) {
          // labels printed before Kinus kept fingerprints count as unchanged
          if (was.hash && !sameContent(was.hash, keys, vals)) changed.push(who(c));
          else if (was.hash && !was.hash.startsWith("v2;")) upgrades.push({ job_id: was.jobId, camper_id: c.id, was: was.hash, content_hash: contentHash(keys, vals) });
        } else {
          const d = divisionOf.get(c.id) ?? null;
          if ((printedIn.get(d) ?? 0) >= PRINTED_DIVISION * (perDivision.get(d) ?? 1)) fresh.push(who(c));
        }
      }
      return { templateId: t.id, templateName: t.name, changed, fresh };
    })
    .filter((u) => u.changed.length || u.fresh.length);
  // a one-off after updating Kinus; 20 at a time, each only if the label still has the old one
  for (let k = 0; k < upgrades.length; k += 20)
    await Promise.all(
      upgrades.slice(k, k + 20).map((u) => admin.from("print_job_items").update({ content_hash: u.content_hash }).eq("job_id", u.job_id).eq("camper_id", u.camper_id).eq("content_hash", u.was)),
    );
  return result;
}

/** "Not needed": remember what these labels say now, so they don't come up again unless they change. */
export async function dismissLabelUpdates(update: LabelUpdate, userId: string): Promise<void> {
  const admin = createAdminClient();
  const ids = [...update.changed, ...update.fresh].map((c) => c.id);
  if (!ids.length) return;
  const { data: t } = await admin.from("print_templates").select("*").eq("id", update.templateId).single();
  if (!t) return;
  const keys = templateKeys(toSpec(t));
  const [full, setup, dismissed] = await Promise.all([loadPrintCampers(admin, ids), loadMergeSetup(admin), loadDismissed()]);
  const forTemplate = { ...(dismissed[update.templateId] ?? {}) };
  for (const c of full) forTemplate[c.id] = contentHash(keys, mergeValues(c, setup.fields, setup.maps));
  const { error } = await admin
    .from("settings")
    .upsert({ key: `label_updates_dismissed:${update.templateId}`, value: forTemplate, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/**
 * After printing from Kinus: the labels show the details as they are now (the page is made
 * at print time), so their fingerprints are brought up to date.
 */
export async function refreshPrintedHashes(jobIds: string[]): Promise<void> {
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("print_jobs").select("id, print_templates(*)").in("id", jobIds);
  const { labelHashes } = await import("./jobs");
  for (const j of jobs ?? []) {
    if (!j.print_templates) continue;
    const items = await fetchAll((from, to) => admin.from("print_job_items").select("job_id, camper_id, copies, content_hash").eq("job_id", j.id).order("camper_id").range(from, to));
    if (!items.length) continue;
    const hashes = await labelHashes(admin, toSpec(j.print_templates as never), items.map((i) => i.camper_id));
    const rows = items.filter((i) => hashes.has(i.camper_id) && hashes.get(i.camper_id) !== i.content_hash).map((i) => ({ ...i, content_hash: hashes.get(i.camper_id)! }));
    for (let k = 0; k < rows.length; k += 500) {
      const { error } = await admin.from("print_job_items").upsert(rows.slice(k, k + 500), { onConflict: "job_id,camper_id" });
      if (error) throw error;
    }
  }
}
