import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { buildList, getPresetsFor, parseCopies } from "@/lib/data/lists";
import { getCampContext } from "@/lib/data/camp";
import { parseFlags } from "@/lib/camper-flags";
import { listHtml } from "@/lib/lists/list-pdf";
import { renderPdf } from "@/lib/print/chromium";
import { pdfFailed, told } from "@/lib/print/download-signal";
import { attachment } from "@/lib/utils";

// the PDF is made by Kinus' printer (/api/render), which may take a while for a whole camp
export const maxDuration = 60;

/** The list as a PDF, the same as printing it from the page (the cover, each group on its own page, copies). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const user = await getCurrentUser();
  const session = await getActiveSession();
  if (!user || !session) return pdfFailed("Sign in again.", 401, sp);
  if (user.checkinLogin) return pdfFailed("Not available on check-in logins.", 403, sp);
  const supabase = await createClient();
  const presets = await getPresetsFor(supabase, user);
  const preset = presets.find((p) => p.id === sp.get("preset")) ?? presets[0];
  if (!preset) return pdfFailed("No list layouts are set up for your role yet.", 404, sp);
  const [{ data: fv }, camp] = await Promise.all([supabase.from("field_visibility").select("field_group, roles"), getCampContext()]);
  try {
    const list = await buildList(supabase, user, preset, { sessionId: session.id, divisionId: sp.get("division") || undefined, bunkId: sp.get("bunk") || undefined, divisionIds: camp.divisionIds, campName: camp.current?.name, only: parseFlags(sp.get("only")), counselors: sp.get("counselors") === "1", filter: sp.get("fcol") ? { key: sp.get("fcol")!.slice(0, 210), value: (sp.get("fval") ?? "__any").slice(0, 300) } : undefined }, fv ?? []);
    const copies = parseCopies(sp.get("copies") ?? preset.copies);
    const { pdf } = await renderPdf(listHtml(list, { session: session.name ?? null, camp: camp.current?.name ?? null, by: user.fullName, copies }));
    await logActivity("download", { what: `List “${preset.name}” (${list.scopeLabel})`, format: "pdf", rows: list.groups.reduce((n, g) => n + g.rows.length, 0) });
    return told(new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": attachment(`${preset.name} - ${list.scopeLabel}.pdf`), "Cache-Control": "no-store" } }), sp, "ok");
  } catch (e) {
    return pdfFailed(`Couldn't make the PDF: ${e instanceof Error ? e.message : String(e)}`, 500, sp);
  }
}
