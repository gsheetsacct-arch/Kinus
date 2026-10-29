import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { anyCode } from "@/lib/attendance/scan";
import { backgroundDataUrl, imageDataUrls, loadMergeSetup, loadPrintCampers } from "./data";
import { fill, mergeValues, SAMPLE_CAMPER } from "./merge";
import { renderDocument } from "./render";
import { customFontCss } from "./custom-fonts";
import type { TemplateSpec } from "./types";
import { widthEstimate } from "./width-estimate";
import { worstValues, type PartText } from "./worst-case";

/**
 * What previews are filled with, and the preview page itself: for the template editor and
 * the design connector alike. Real campers are read on the server, only in the divisions the
 * person can see (null: all of them).
 */

/** The active session, read with the server's key (the design connector has no sign-in cookie). */
async function getActiveSession() {
  const { data } = await createAdminClient().from("sessions").select("id, name").eq("is_active", true).maybeSingle();
  return data;
}

/** Every field filled from the made-up sample camper. */
export async function sampleValues(): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const setup = await loadMergeSetup(admin);
  const values = mergeValues(SAMPLE_CAMPER as never, setup.fields, setup.maps);
  // a field from an export column the made-up camper doesn't have (one added to the export
  // since: family.city) shows a real camper's value, rather than looking like it doesn't work
  const blank = setup.fields.filter((f) => !values[f.key] && f.source_field.includes("."));
  const session = blank.length ? await getActiveSession() : null;
  if (session) {
    const { data } = await admin.from("campers").select("source_data").eq("session_id", session.id).is("archived_at", null).not("source_data", "is", null).limit(300);
    for (const f of blank)
      for (const row of data ?? []) {
        const c = { ...SAMPLE_CAMPER, source_data: { ...SAMPLE_CAMPER.source_data, ...((row.source_data ?? {}) as Record<string, string>) } };
        const v = mergeValues(c as never, [f], setup.maps)[f.key];
        if (v) {
          values[f.key] = v;
          break;
        }
      }
  }
  return values;
}

/** Campers of the active session the person can see. */
export async function camperIdsInView(divisionIds: string[] | null): Promise<string[]> {
  const session = await getActiveSession();
  if (!session || (divisionIds && !divisionIds.length)) return [];
  const rows = await fetchAll((from, to) => {
    let q = createAdminClient().from("campers").select("id").eq("session_id", session.id).is("archived_at", null);
    if (divisionIds) q = q.in("division_id", divisionIds);
    return q.order("id").range(from, to);
  });
  return rows.map((r) => r.id);
}

/**
 * A real camper's values: by code, or the one whose text is longest for its box on these
 * parts (to check long names fit).
 */
export async function camperValues(
  who: { kind: "code"; code: string } | { kind: "longest"; texts: { text: string; w: number }[] },
  divisionIds: string[] | null,
): Promise<{ values: Record<string, string>; label: string } | { error: string }> {
  const admin = createAdminClient();
  const session = await getActiveSession();
  if (!session) return { error: "No active session." };
  let id: string | null = null;
  if (who.kind === "code") {
    const code = anyCode(who.code);
    if (!code) return { error: "Type a camper code (0012)." };
    let q = admin.from("campers").select("id").eq("session_id", session.id).eq("camper_code", code);
    if (divisionIds) q = q.in("division_id", divisionIds.length ? divisionIds : ["00000000-0000-0000-0000-000000000000"]);
    id = (await q.maybeSingle()).data?.id ?? null;
    if (!id) return { error: `No camper ${code} in your area.` };
  } else {
    const ids = await camperIdsInView(divisionIds);
    const texts = who.texts.filter((t) => t.text.includes("{{") && t.w > 0).slice(0, 30);
    if (!ids.length || !texts.length) return { error: "No campers to look at." };
    const [setup, campers] = await Promise.all([loadMergeSetup(admin), loadPrintCampers(admin, ids)]);
    let best: { id: string; score: number } | null = null;
    for (const c of campers) {
      const v = mergeValues(c, setup.fields, setup.maps);
      const score = Math.max(...texts.map((t) => fill(t.text, (k) => v[k] ?? "").length / t.w));
      if (!best || score > best.score) best = { id: c.id, score };
    }
    id = best?.id ?? null;
  }
  if (!id) return { error: "Camper not found." };
  const [setup, [c]] = await Promise.all([loadMergeSetup(admin), loadPrintCampers(admin, [id])]);
  if (!c) return { error: "Camper not found." };
  return { values: mergeValues(c, setup.fields, setup.maps), label: `${c.first_name} ${c.last_name}${who.kind === "longest" ? " (longest text)" : ""}` };
}

/** Every visible camper's values (for checking that every name fits). */
export async function allCamperValues(divisionIds: string[] | null): Promise<{ name: string; values: Record<string, string> }[]> {
  const admin = createAdminClient();
  const ids = (await camperIdsInView(divisionIds)).slice(0, 3000);
  if (!ids.length) return [];
  const [setup, campers] = await Promise.all([loadMergeSetup(admin), loadPrintCampers(admin, ids)]);
  return campers.map((c) => ({ name: `${c.first_name} ${c.last_name}`, values: mergeValues(c, setup.fields, setup.maps) }));
}

/** The preview page: the template filled with these values, as it prints (outlined). */
export async function previewDocument(spec: TemplateSpec, items: { values: Record<string, string>; copies: number }[], opts: { fullSheet?: boolean; outlines?: boolean } = {}): Promise<string> {
  const admin = createAdminClient();
  // the background as saved, never a path someone names
  const bgPath = spec.id ? (await admin.from("print_templates").select("background_path").eq("id", spec.id).maybeSingle()).data?.background_path : null;
  const [background, images, fontCss] = await Promise.all([
    bgPath ? backgroundDataUrl(admin, bgPath) : Promise.resolve(null),
    // only uploaded pictures
    imageDataUrls(
      admin,
      spec.layers.filter((l) => l.type !== "image" || /^pictures\/[\w.-]+$/.test(l.path)),
    ),
    customFontCss(spec),
  ]);
  const sheet = opts.fullSheet ? spec.sheet_layout : null;
  return renderDocument({ ...spec, sheet_layout: sheet }, items, { background, images, outlines: opts.outlines ?? true, fontCss });
}

export type FieldExtremes = { key: string; label: string; filled: number; longest: { value: string; width: number; letters: number; camper: string }[] };

/**
 * For each field, its longest values among real campers (widest first, different values),
 * and how many campers have it filled in. What a design has to make room for.
 */
export async function longestPerField(divisionIds: string[] | null, opts: { keys?: string[]; top?: number } = {}): Promise<FieldExtremes[]> {
  const [people, setup] = await Promise.all([allCamperValues(divisionIds), loadMergeSetup(createAdminClient())]);
  const fields = setup.fields.filter((f) => (opts.keys?.length ? opts.keys.includes(f.key) : f.enabled !== false));
  return fields.map((f) => {
    const seen = new Map<string, { value: string; width: number; letters: number; camper: string }>();
    let filled = 0;
    for (const p of people) {
      const v = (p.values[f.key] ?? "").trim();
      if (!v) continue;
      filled++;
      if (!seen.has(v)) seen.set(v, { value: v, width: widthEstimate(v), letters: [...v].length, camper: p.name });
    }
    const longest = [...seen.values()].sort((a, b) => b.width - a.width || b.letters - a.letters).slice(0, opts.top ?? 5);
    return { key: f.key, label: f.label, filled, longest };
  });
}

/**
 * The worst case: every field at once with its widest real value (the longest first name, the
 * longest bunk…), but the fields printed together in one part (first and last name) from one
 * real camper: the one whose text is widest there (lib/print/worst-case). A tag that fits this
 * fits everyone.
 */
export async function worstCaseValues(divisionIds: string[] | null, parts: PartText[] = []): Promise<{ values: Record<string, string>; label: string } | { error: string }> {
  const [people, setup] = await Promise.all([allCamperValues(divisionIds), loadMergeSetup(createAdminClient())]);
  if (!people.length) return { error: "No campers to look at." };
  const values = await sampleValues();
  for (const f of setup.fields) {
    const widest = people.map((p) => (p.values[f.key] ?? "").trim()).reduce((a, b) => (widthEstimate(b) > widthEstimate(a) ? b : a), "");
    if (widest) values[f.key] = widest;
  }
  return { values: worstValues(people.map((p) => p.values), parts, values), label: "the longest of every field at once (worst case)" };
}
