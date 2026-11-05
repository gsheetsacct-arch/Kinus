import "server-only";

export type TagKind = "new" | "updated";

/**
 * For a print job's note: who gets their first tag (a new package) and whose tag changed ("Swap out": an
 * existing bag to find), one line each under the job's summary. Empty when there's nobody.
 */
export function changeNote(people: { name: string; kind: TagKind }[]): string {
  const line = (kind: TagKind, label: string) => {
    const names = people.filter((p) => p.kind === kind).map((p) => p.name.trim()).sort((a, b) => a.localeCompare(b));
    return names.length ? `${label} (${names.length}): ${names.join(", ")}` : null;
  };
  const lines = [line("new", "New"), line("updated", "Swap out")].filter(Boolean);
  return lines.length ? `\n${lines.join("\n")}` : "";
}

/** The same for campers, by id (their names read with the server's key, in chunks). */
export async function camperChangeNote(kinds: Map<string, TagKind> | null): Promise<string> {
  if (!kinds?.size) return "";
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { inChunks } = await import("@/lib/supabase/in-chunks");
  const rows = await inChunks([...kinds.keys()], (c) => createAdminClient().from("campers").select("id, first_name, last_name").in("id", c));
  return changeNote(rows.map((r) => ({ name: `${r.first_name} ${r.last_name}`, kind: kinds.get(r.id)! })));
}
