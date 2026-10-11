import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { buildList, getPresetsFor } from "@/lib/data/lists";
import { getCampContext } from "@/lib/data/camp";
import { FIELD_BY_KEY } from "@/lib/fields";
import { attachment } from "@/lib/utils";

const csvCell = (v: string | boolean | null) => {
  const s = v === null ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a UTF-8 BOM so Excel opens Hebrew and French correctly. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const session = await getActiveSession();
  if (!user || !session) return new NextResponse("Unauthorized", { status: 401 });
  const sp = request.nextUrl.searchParams;
  const supabase = await createClient();
  const presets = await getPresetsFor(supabase, user);
  const preset = presets.find((p) => p.id === sp.get("preset")) ?? presets[0];
  if (!preset) return new NextResponse("No preset", { status: 404 });
  const [{ data: fv }, camp] = await Promise.all([supabase.from("field_visibility").select("field_group, roles"), getCampContext()]);
  const list = await buildList(supabase, user, preset, { sessionId: session.id, divisionId: sp.get("division") || undefined, bunkId: sp.get("bunk") || undefined, divisionIds: camp.divisionIds, campName: camp.current?.name }, fv ?? []);
  const lines: string[] = [];
  // the group (bunk/division) as its own first column, unless the list already shows it
  const withGroup = Boolean(preset.group_by) && !list.columns.some((c) => c.key === preset.group_by);
  lines.push([...(withGroup ? [FIELD_BY_KEY[preset.group_by!]?.label ?? "Group"] : []), ...list.columns.map((c) => c.label)].map(csvCell).join(","));
  for (const g of list.groups) for (const r of g.rows) lines.push([...(withGroup ? [g.title] : []), ...r.cells].map(csvCell).join(","));
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const name = `${preset.name} - ${list.scopeLabel}`.replace(/[\\/:*?"<>|]+/g, "_");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(`${name}.csv`), "Cache-Control": "private, no-store" },
  });
}
