import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ContactLike, CamperLike } from "@/lib/fields";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { MergeField, Transform, ValueMap, TemplateSpec, Layer, SheetLayout } from "./types";

type DB = SupabaseClient<Database>;
export type PrintCamper = CamperLike & { id: string; division_color: string | null; division_name: string | null; bunk_name: string | null; last_name: string; first_name: string };

export async function loadMergeSetup(db: DB): Promise<{ fields: MergeField[]; maps: Map<string, ValueMap> }> {
  const [{ data: fields }, { data: maps }, { data: entries }] = await Promise.all([
    // "*": works before and after the merge-list switch (migration 0012) exists
    db.from("merge_fields").select("*").order("sort_order").order("key"),
    db.from("value_maps").select("id, name, source_field"),
    db.from("value_map_entries").select("map_id, source_value, output_value"),
  ]);
  const m = new Map<string, ValueMap>();
  for (const v of maps ?? []) m.set(v.id, { ...v, entries: (entries ?? []).filter((e) => e.map_id === v.id) });
  return { fields: (fields ?? []).map((f) => ({ key: f.key, label: f.label, source_field: f.source_field, transforms: (f.transforms as Transform[]) ?? [], enabled: (f as { enabled?: boolean }).enabled ?? true })), maps: m };
}

export function toSpec(t: Database["public"]["Tables"]["print_templates"]["Row"]): TemplateSpec {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    page_width_mm: Number(t.page_width_mm),
    page_height_mm: Number(t.page_height_mm),
    layers: (t.layers as Layer[]) ?? [],
    sheet_layout: (t.sheet_layout as SheetLayout | null) ?? null,
    background_path: t.background_path,
  };
}

/** Background image from the private templates bucket, inlined as a data URL. */
export async function backgroundDataUrl(admin: DB, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin.storage.from("templates").download(path);
  if (!data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return `data:${data.type || "image/png"};base64,${buf.toString("base64")}`;
}

/** Full camper rows (service role) for the given ids, with division/bunk names, colours and contacts. */
export async function loadPrintCampers(admin: DB, ids: string[]): Promise<PrintCamper[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 150) chunks.push(unique.slice(i, i + 150));
  // all chunks at once: a 1,000-tag batch is 7 requests side by side, not one after another
  const parts = await Promise.all(
    chunks.map(async (chunk) => {
      const [{ data: cs, error }, { data: ks, error: ke }] = await Promise.all([
        admin.from("campers").select("*, divisions(name, color), bunks(name)").in("id", chunk),
        admin.from("camper_contacts").select("camper_id, role, slot, name, phone, phone_e164, email").in("camper_id", chunk),
      ]);
      if (error) throw error;
      if (ke) throw ke;
      return { cs: cs ?? [], ks: (ks ?? []) as (ContactLike & { camper_id: string })[] };
    }),
  );
  const contacts = new Map<string, ContactLike[]>();
  for (const k of parts.flatMap((p) => p.ks)) contacts.set(k.camper_id, [...(contacts.get(k.camper_id) ?? []), k]);
  return parts.flatMap((p) =>
    p.cs.map((c) => {
      const d = c.divisions as { name: string; color: string | null } | null;
      const b = c.bunks as { name: string } | null;
      return {
        ...(c as unknown as CamperLike),
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        division_name: d?.name ?? null,
        division_color: d?.color ?? null,
        bunk_name: b?.name ?? null,
        contacts: contacts.get(c.id) ?? [],
      };
    }),
  );
}

/** Campers of a session (optionally a division/bunk), in printing order. */
export async function campersInScope(db: DB, sessionId: string, scope: { divisionId?: string; bunkId?: string }): Promise<string[]> {
  const rows = await fetchAll((from, to) => {
    let q = db.from("campers").select("id, last_name, first_name, bunk_id").eq("session_id", sessionId).is("archived_at", null);
    if (scope.divisionId) q = q.eq("division_id", scope.divisionId);
    if (scope.bunkId) q = q.eq("bunk_id", scope.bunkId);
    return q.order("bunk_id").order("last_name").order("first_name").order("id").range(from, to);
  });
  return rows.map((r) => r.id);
}

export const byBunkThenName = (a: PrintCamper, b: PrintCamper) =>
  (a.division_name ?? "").localeCompare(b.division_name ?? "") ||
  (a.bunk_name ?? "").localeCompare(b.bunk_name ?? "", undefined, { numeric: true }) ||
  a.last_name.localeCompare(b.last_name) ||
  a.first_name.localeCompare(b.first_name);
