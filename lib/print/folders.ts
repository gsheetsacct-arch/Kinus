import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { inChunks } from "@/lib/supabase/in-chunks";

/** A folder's name as kept: trimmed, one space between words; "" is no folder. */
export const cleanFolder = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;

export type FolderOps = {
  /** Put templates in a folder (null or "": take them out of one), and optionally rename them. */
  moves?: { template_id: string; folder?: string | null; name?: string }[];
  /** Rename a folder (every template in it moves along); to "" empties it. */
  renames?: { from: string; to: string | null }[];
  /** Templates in the order they should be listed (in their folders). */
  order?: string[];
};

/**
 * Organizes Print → Templates: folders, names and order. The caller checks the person may
 * edit templates. Says what changed.
 */
export async function organizeTemplates(ops: FolderOps): Promise<string> {
  const admin = createAdminClient();
  const done: string[] = [];
  for (const r of ops.renames ?? []) {
    const from = cleanFolder(r.from);
    if (!from) continue;
    const to = cleanFolder(r.to);
    const { data, error } = await admin.from("print_templates").update({ folder: to }).eq("folder", from).select("id");
    if (error) throw error;
    done.push(to ? `folder “${from}” renamed “${to}” (${data?.length ?? 0})` : `folder “${from}” emptied (${data?.length ?? 0})`);
  }
  let moved = 0;
  let renamed = 0;
  for (const m of ops.moves ?? []) {
    const patch: { folder?: string | null; name?: string } = {};
    if (m.folder !== undefined) patch.folder = cleanFolder(m.folder);
    const name = m.name?.replace(/\s+/g, " ").trim().slice(0, 120);
    if (name) patch.name = name;
    if (!Object.keys(patch).length) continue;
    const { data, error } = await admin.from("print_templates").update(patch).eq("id", m.template_id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error(`No template with id ${m.template_id}.`);
    if ("folder" in patch) moved++;
    if (patch.name) renamed++;
  }
  if (moved) done.push(`${moved} moved`);
  if (renamed) done.push(`${renamed} renamed`);
  if (ops.order?.length) {
    const ids = [...new Set(ops.order)];
    const known = new Set((await inChunks(ids, (c) => admin.from("print_templates").select("id").in("id", c))).map((t) => t.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) throw new Error(`No template with id ${missing[0]}.`);
    for (let i = 0; i < ids.length; i++) {
      const { error } = await admin.from("print_templates").update({ sort_order: (i + 1) * 10 }).eq("id", ids[i]);
      if (error) throw error;
    }
    done.push(`${ids.length} put in order`);
  }
  return done.length ? `Done: ${done.join(", ")}.` : "Nothing to change.";
}

/** Folder names in use, A–Z. */
export async function templateFolders(): Promise<string[]> {
  const { data } = await createAdminClient().from("print_templates").select("folder").not("folder", "is", null);
  return [...new Set((data ?? []).map((t) => t.folder).filter((f): f is string => Boolean(f)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
