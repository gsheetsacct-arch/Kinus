import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ContactLike, CamperLike } from "@/lib/fields";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { compareBunkNames, compareDivisionNames } from "@/lib/bunk-order";
import { hebrewNameColumns } from "./name-columns";
import { withFixes } from "@/lib/source-fixes";
import { extraValue } from "@/lib/import/extra-fields";
import { isHebrew } from "@/lib/hebrew-names";
import { picturesOf, type BackSide, type MergeField, type Transform, type ValueMap, type TemplateSpec, type Layer, type SheetLayout } from "./types";

type DB = SupabaseClient<Database>;
export type PrintCamper = CamperLike & { id: string; division_color: string | null; division_name: string | null; bunk_name: string | null; last_name: string; first_name: string; /** the Hebrew last name, in Hebrew and French divisions (sorting) */ heb_last?: string | null };

export async function loadMergeSetup(db: DB): Promise<{ fields: MergeField[]; maps: Map<string, ValueMap> }> {
  const [{ data: fields }, { data: maps }, { data: entries }] = await Promise.all([
    // "*": works before and after the merge-list switch (migration 0012) exists
    db.from("merge_fields").select("*").order("sort_order").order("key"),
    db.from("value_maps").select("id, name, source_field"),
    db.from("value_map_entries").select("map_id, source_value, output_value"),
  ]);
  const m = new Map<string, ValueMap>();
  for (const v of maps ?? []) m.set(v.id, { ...v, entries: (entries ?? []).filter((e) => e.map_id === v.id) });
  const list: MergeField[] = (fields ?? []).map((f) => ({ key: f.key, label: f.label, source_field: f.source_field, transforms: (f.transforms as Transform[]) ?? [], enabled: (f as { enabled?: boolean }).enabled ?? true }));
  // the buzzer (pager) number is always there: 001 and up (lib/buzzers)
  if (!list.some((f) => f.key === "BUZZER")) list.push({ key: "BUZZER", label: "Buzzer number", source_field: "buzzer", transforms: [], enabled: true });
  return { fields: list, maps: m };
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
    back: ((t as { back?: unknown }).back as BackSide | null | undefined) ?? null,
    thermal: Boolean((t as { thermal?: boolean }).thermal),
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

/** The pictures a template's parts show (logos…), as data URLs for the page, by stored path. */
export async function imageDataUrls(admin: DB, layers: { type: string; path?: string; byDivision?: Record<string, string> }[]): Promise<Record<string, string>> {
  const paths = [...new Set(layers.filter((l) => l.type === "image").flatMap(picturesOf))];
  const urls = await Promise.all(paths.map((p) => backgroundDataUrl(admin, p).catch(() => null)));
  return Object.fromEntries(paths.flatMap((p, i) => (urls[i] ? [[p, urls[i]!]] : [])));
}

/** Full camper rows (service role) for the given ids, with division/bunk names, colours and contacts. */
export async function loadPrintCampers(admin: DB, ids: string[]): Promise<PrintCamper[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 150) chunks.push(unique.slice(i, i + 150));
  // all chunks at once: a 1,000-tag batch is 7 requests side by side, not one after another
  // Hebrew and French divisions sort by the Hebrew last name (the export column the Hebrew last-name field reads)
  const hebrewLast = hebrewNameColumns(admin).then((cols) => cols.filter((c) => c.kind === "last").map((c) => c.column));
  const parts = await Promise.all(
    chunks.map(async (chunk) => {
      const [{ data: cs, error }, { data: ks, error: ke }] = await Promise.all([
        admin.from("campers").select("*, divisions(name, color, language), bunks(name)").in("id", chunk),
        admin.from("camper_contacts").select("camper_id, role, slot, name, phone, phone_e164, email").in("camper_id", chunk),
      ]);
      if (error) throw error;
      if (ke) throw ke;
      return { cs: cs ?? [], ks: (ks ?? []) as (ContactLike & { camper_id: string })[] };
    }),
  );
  const contacts = new Map<string, ContactLike[]>();
  for (const k of parts.flatMap((p) => p.ks)) contacts.set(k.camper_id, [...(contacts.get(k.camper_id) ?? []), k]);
  const lastColumns = await hebrewLast.catch(() => [] as string[]);
  const hebLastOf = (c: { source_data: unknown; source_fixes?: unknown }) => {
    const row = withFixes(c.source_data, c.source_fixes);
    const v = lastColumns.map((col) => extraValue(row, col)).find((x) => x && isHebrew(x));
    return v?.trim() || null;
  };
  return parts.flatMap((p) =>
    p.cs.map((c) => {
      const d = c.divisions as { name: string; color: string | null; language?: string } | null;
      const b = c.bunks as { name: string } | null;
      return {
        ...(c as unknown as CamperLike),
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        division_name: d?.name ?? null,
        division_color: d?.color ?? null,
        bunk_name: b?.name ?? null,
        heb_last: d?.language === "he" || d?.language === "fr" ? hebLastOf(c as never) : null,
        contacts: contacts.get(c.id) ?? [],
      };
    }),
  );
}

export type PrintCamperBrief = { id: string; first_name: string; last_name: string; division_id: string | null; division_name: string | null; division_color: string | null; bunk_name: string | null };

/** Just enough of each camper to sort, count and split by division (no export columns or contacts). */
export async function loadPrintCampersBrief(admin: DB, ids: string[]): Promise<PrintCamperBrief[]> {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 150) chunks.push(unique.slice(i, i + 150));
  const parts = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await admin.from("campers").select("id, first_name, last_name, division_id, divisions(name, color), bunks(name)").in("id", chunk);
      if (error) throw error;
      return data ?? [];
    }),
  );
  return parts.flat().map((c) => {
    const d = c.divisions as { name: string; color: string | null } | null;
    const b = c.bunks as { name: string } | null;
    return { id: c.id, first_name: c.first_name, last_name: c.last_name, division_id: c.division_id, division_name: d?.name ?? null, division_color: d?.color ?? null, bunk_name: b?.name ?? null };
  });
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

export { parseOrder, type PrintOrder } from "./order";
import type { PrintOrder } from "./order";

/** Printing order: division (1, 2, 3, then the rest), bunk (Alef-Beis), name; no division or bunk yet comes last. */
/** heb_last: the Hebrew last name, for campers of Hebrew and French divisions (lib/print/data loadPrintCampers). */
type Sortable = { division_name: string | null; bunk_name: string | null; last_name: string; first_name: string; heb_last?: string | null };
/**
 * Last name, then first: in a Hebrew or French division by the Hebrew last name (א–ת), those
 * without one after them by the English name.
 */
const byNameInPlace = (a: Sortable, b: Sortable) =>
  Number(!a.heb_last) - Number(!b.heb_last) ||
  (a.heb_last && b.heb_last ? a.heb_last.localeCompare(b.heb_last, "he") : 0) ||
  a.last_name.localeCompare(b.last_name) ||
  a.first_name.localeCompare(b.first_name);
export const byBunkThenName = (a: Sortable, b: Sortable) =>
  Number(!a.division_name) - Number(!b.division_name) ||
  compareDivisionNames(a.division_name ?? "", b.division_name ?? "") ||
  Number(!a.bunk_name) - Number(!b.bunk_name) ||
  compareBunkNames(a.bunk_name ?? "", b.bunk_name ?? "") ||
  byNameInPlace(a, b);

const byName = (a: Sortable, b: Sortable) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);
const byDivision = (a: Sortable, b: Sortable) => Number(!a.division_name) - Number(!b.division_name) || compareDivisionNames(a.division_name ?? "", b.division_name ?? "");
/** The comparer for a print order. */
export const sortFor = (order: PrintOrder) => (order === "name" ? byName : order === "division" ? (a: Sortable, b: Sortable) => byDivision(a, b) || byNameInPlace(a, b) : byBunkThenName);
