import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { canUsePrintArea, visibleFieldGroups } from "@/lib/auth/permissions";
import { getCampContext } from "@/lib/data/camp";
import { groupOfKey, UNGATED_GROUPS } from "@/lib/fields";
import { batchCamperIds, BATCH_WHICH, type BatchWhich } from "@/lib/print/batch";
import { byBunkThenName, loadMergeSetup, loadPrintCampers } from "@/lib/print/data";
import { mergeValues } from "@/lib/print/merge";

export const maxDuration = 60;

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Camper fields a merge field reads ("tshirt_size", "{{first_name}} {{last_name}}", "{{a|b}}"). */
const sourcesOf = (source: string) =>
  source.includes("{{") ? [...source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].flatMap((m) => m[1].split("|").map((k) => k.trim())) : [source.trim()];

/**
 * Mail-merge data for Publisher (or Word/Excel): one row per camper, one column per merge
 * field, values already converted (TSHIRT = "YS", DIV = "1"…). UTF-8 with BOM for Hebrew.
 */
export async function GET(request: NextRequest) {
  const [user, session] = await Promise.all([getCurrentUser(), getActiveSession()]);
  if (!user || !session) return new NextResponse("Sign in first.", { status: 401 });
  if (!canUsePrintArea(user)) return new NextResponse("Not allowed.", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const which = (sp.get("which") ?? "all") as BatchWhich;
  if (!(which in BATCH_WHICH)) return new NextResponse("Bad request.", { status: 400 });
  const [kind, id] = (sp.get("where") ?? "").split(":");
  const supabase = await createClient();
  const camp = await getCampContext();
  const ids = await batchCamperIds(supabase, session.id, { divisionIds: camp.divisionIds, divisionId: kind === "d" ? id : undefined, bunkId: kind === "b" ? id : undefined }, which, sp.get("template") ?? "");
  const admin = createAdminClient();
  const [{ data: fv }, setup, campers] = await Promise.all([supabase.from("field_visibility").select("field_group, roles"), loadMergeSetup(admin), loadPrintCampers(admin, ids)]);
  campers.sort(byBunkThenName);
  // a spreadsheet travels: leave out details this person's role can't see
  const allowed = visibleFieldGroups(user, fv ?? []);
  const hidden = new Set(setup.fields.filter((f) => sourcesOf(f.source_field).some((k) => { const g = groupOfKey(k); return !UNGATED_GROUPS.includes(g) && !allowed.has(g); })).map((f) => f.key));
  // only fields on the merge list
  const keys = setup.fields.filter((f) => f.enabled !== false).map((f) => f.key);
  const lines = [keys.join(",")];
  for (const c of campers) {
    const v = mergeValues(c, setup.fields, setup.maps);
    lines.push(keys.map((k) => cell(hidden.has(k) ? "" : (v[k] ?? ""))).join(","));
  }
  const name = `kinus-merge-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
