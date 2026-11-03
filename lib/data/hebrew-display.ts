import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hebrewNameColumns } from "@/lib/print/name-columns";
import { columnKey } from "@/lib/import/extra-fields";

const HEBREW = /[א-ת]/;

/**
 * The Hebrew names of campers in Hebrew-language divisions (Divisions & bunks → language),
 * for showing and searching them in Hebrew: from the export's Hebrew-name columns (the ones
 * the Hebrew-name label fields read), with any fixes made on Print → Hebrew names. Only
 * names actually written in Hebrew letters; anyone else keeps their English name.
 * For campers the person can already see (the caller's own list).
 */
export async function hebrewNamesFor(campers: { id: string; division_id: string | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const divisionIds = [...new Set(campers.map((c) => c.division_id).filter((x): x is string => Boolean(x)))];
  if (!divisionIds.length) return out;
  const admin = createAdminClient();
  const [{ data: divisions }, columns] = await Promise.all([admin.from("divisions").select("id, language").in("id", divisionIds), hebrewNameColumns(admin)]);
  const hebrewDivisions = new Set((divisions ?? []).filter((d) => d.language === "he").map((d) => d.id));
  const ids = campers.filter((c) => c.division_id && hebrewDivisions.has(c.division_id)).map((c) => c.id);
  if (!ids.length || !columns.length) return out;
  const first = columns.find((c) => c.kind === "first");
  const last = columns.find((c) => c.kind === "last");
  const full = columns.find((c) => c.kind === "full");
  const keys = [first, last, full].filter((c): c is NonNullable<typeof c> => Boolean(c)).map((c) => columnKey(c.column));
  // bound: the client's rpc reads its own settings (migration 0050's camper_source_values, fixes included)
  const rpc = admin.rpc.bind(admin) as unknown as (f: string, a: object) => PromiseLike<{ data: { camper_id: string; key: string; value: string | null }[] | null; error: unknown }>;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const parts = await Promise.all(chunks.map((chunk) => rpc("camper_source_values", { p_ids: chunk, p_keys: keys })));
  const got = new Map<string, Map<string, string>>();
  for (const p of parts) {
    if (p.error) {
      console.error("Reading Hebrew names failed", p.error);
      return out;
    }
    for (const r of p.data ?? []) {
      if (!got.has(r.camper_id)) got.set(r.camper_id, new Map());
      got.get(r.camper_id)!.set(r.key, (r.value ?? "").trim());
    }
  }
  const he = (v: string | undefined) => (v && HEBREW.test(v) ? v : "");
  for (const id of ids) {
    const row = got.get(id);
    if (!row) continue;
    const f = he(first ? row.get(columnKey(first.column)) : undefined);
    const l = he(last ? row.get(columnKey(last.column)) : undefined);
    const name = f || l ? [f, l].filter(Boolean).join(" ") : he(full ? row.get(columnKey(full.column)) : undefined);
    if (name) out.set(id, name.replace(/\s+/g, " "));
  }
  return out;
}
