import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AreaTree = {
  groups: { id: string; name: string }[];
  divisions: { id: string; name: string; group_id: string | null; color: string | null; bunks: { id: string; name: string }[] }[];
};

/** Groups → divisions → bunks of a session, in display order. */
export async function loadAreaTree(db: SupabaseClient<Database>, sessionId: string | null | undefined): Promise<AreaTree> {
  if (!sessionId) return { groups: [], divisions: [] };
  const [{ data: groups }, { data: divisions }] = await Promise.all([
    db.from("division_groups").select("id, name, sort_order").eq("session_id", sessionId).order("sort_order").order("name"),
    db.from("divisions").select("id, name, group_id, color, sort_order, bunks(id, name, sort_order)").eq("session_id", sessionId).order("sort_order").order("name"),
  ]);
  return {
    groups: (groups ?? []).map(({ id, name }) => ({ id, name })),
    divisions: (divisions ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      group_id: d.group_id,
      color: d.color,
      bunks: [...((d.bunks as { id: string; name: string; sort_order: number }[]) ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name })),
    })),
  };
}

export type AreaValue = { group_id: string | null; division_id: string | null; bunk_id: string | null };

/** Form values: "g:<group>", "d:<division>", "b:<division>:<bunk>". */
export function encodeArea(a: AreaValue): string {
  if (a.group_id) return `g:${a.group_id}`;
  if (a.bunk_id) return `b:${a.division_id}:${a.bunk_id}`;
  return `d:${a.division_id}`;
}
export function decodeArea(v: string): AreaValue | null {
  const [k, a, b] = v.split(":");
  if (k === "g" && a) return { group_id: a, division_id: null, bunk_id: null };
  if (k === "d" && a) return { group_id: null, division_id: a, bunk_id: null };
  if (k === "b" && a && b) return { group_id: null, division_id: a, bunk_id: b };
  return null;
}

export function areaNames(tree: AreaTree) {
  const group = (id: string) => tree.groups.find((g) => g.id === id)?.name ?? "A camp from another session";
  const division = (id: string) => tree.divisions.find((d) => d.id === id)?.name ?? "A division from another session";
  const bunk = (id: string) => tree.divisions.flatMap((d) => d.bunks).find((b) => b.id === id)?.name ?? "?";
  return { group, division, bunk };
}
