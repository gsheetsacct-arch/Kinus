import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { buildList, getPresetsFor } from "@/lib/data/lists";
import { getCampContext } from "@/lib/data/camp";

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
  const { data: fv } = await supabase.from("field_visibility").select("field_group, roles");
  const list = await buildList(supabase, user, preset, { sessionId: session.id, divisionId: sp.get("division") || undefined, bunkId: sp.get("bunk") || undefined, divisionIds: (await getCampContext()).divisionIds }, fv ?? []);
  const lines: string[] = [];
  const groupCol = preset.group_by ? [preset.group_by] : [];
  lines.push([...groupCol, ...list.columns.map((c) => c.label)].map(csvCell).join(","));
  for (const g of list.groups) for (const r of g.rows) lines.push([...(preset.group_by ? [g.title] : []), ...r.cells].map(csvCell).join(","));
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const name = `${preset.name} - ${list.scopeLabel}`.replace(/[^\w֐-׿À-ſ .-]+/g, "_");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
