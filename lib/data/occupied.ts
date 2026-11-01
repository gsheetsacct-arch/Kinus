import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * The divisions and bunks that have campers this session (archived ones aside): the places to
 * pick from when looking at or printing for campers. A bunk that no longer has kids isn't offered
 * there (it's still there for moving a camper or giving staff their bunk).
 */
export async function occupiedPlaces(sessionId: string): Promise<{ divisions: Set<string>; bunks: Set<string> }> {
  const admin = createAdminClient();
  const rows = await fetchAll((from, to) => admin.from("campers").select("id, division_id, bunk_id").eq("session_id", sessionId).is("archived_at", null).order("id").range(from, to));
  return {
    divisions: new Set(rows.map((r) => r.division_id).filter((x): x is string => Boolean(x))),
    bunks: new Set(rows.map((r) => r.bunk_id).filter((x): x is string => Boolean(x))),
  };
}

/** A division list with only the divisions and bunks that have campers. */
export const withCampers = <D extends { id: string; bunks: { id: string }[] }>(divisions: D[], places: { divisions: Set<string>; bunks: Set<string> }): D[] =>
  divisions.filter((d) => places.divisions.has(d.id)).map((d) => ({ ...d, bunks: d.bunks.filter((b) => places.bunks.has(b.id)) }));
