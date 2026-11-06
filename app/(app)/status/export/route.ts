import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { visibleFieldGroups } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { loadBoard } from "@/lib/data/board";
import { getCampContext } from "@/lib/data/camp";
import { campStarted, divisionCounts, flagRows, loadFollowups, loadRules } from "@/lib/data/missing";
import { decodeScope, inScope } from "@/lib/attendance/board";
import { compareBunkNames, compareDivisionNames } from "@/lib/bunk-order";
import { tableDownload } from "@/lib/export";
import { formatDateTime, formatTime, attachment } from "@/lib/utils";
import { pdfFailed, told } from "@/lib/print/download-signal";

export const maxDuration = 60;

const VIEWS = { expected: "Not here yet", check: "Check up", later: "Coming later" } as const;
type View = keyof typeof VIEWS;

/**
 * Who's here → Not here yet (or Check up, Coming later) as an easy list to hand out: Excel
 * (?format=xlsx) or PDF (?format=pdf), for the place picked on the board (?where=…). Name,
 * division, bunk, code, buzzer, why they're flagged, the follow-up note and parents' phones
 * (for those who may see contacts), by division, bunk and name.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [user, session, camp] = await Promise.all([getCurrentUser(), getActiveSession(), getCampContext()]);
  if (!user || !session) return pdfFailed("Sign in again.", 401, sp);
  if (user.checkinLogin) return pdfFailed("Not available on check-in logins.", 403, sp);
  const view: View = sp.get("view") === "check" ? "check" : sp.get("view") === "later" ? "later" : "expected";
  const pdf = sp.get("format") === "pdf";
  // simple: just name and bunk
  const simple = sp.get("simple") === "1";
  try {
    const supabase = await createClient();
    const [{ data: fv }, tree] = await Promise.all([supabase.from("field_visibility").select("field_group, roles"), loadAreaTree(supabase, session.id)]);
    const contacts = visibleFieldGroups(user, fv ?? []).has("contacts");
    const [rows, rules, followups, started] = await Promise.all([loadBoard(supabase, session.id, contacts, camp.divisionIds), loadRules(supabase, session.id), loadFollowups(supabase, session.id), campStarted(session.id)]);
    const counts = await divisionCounts(session.id, rows.map((r) => r.divisionId));
    const flags = flagRows(rows, rules, followups, started, counts);
    const scope = decodeScope(sp.get("where")) ?? { kind: "all" as const };
    const division = new Map(tree.divisions.map((d) => [d.id, d.name]));
    const bunk = new Map(tree.divisions.flatMap((d) => d.bunks.map((b) => [b.id, b.name] as const)));
    const flagText = (id: string) => {
      const f = flags[id];
      return !f ? "" : f.kind === "check" ? `Check up: ${f.reason}` : f.kind === "later" ? `Coming later (until ${formatTime(f.until)})` : "";
    };
    const list = rows
      .filter((r) => r.status === "expected" && inScope(r, scope, tree))
      .filter((r) => view === "expected" || flags[r.id]?.kind === view)
      .map((r) => ({ r, div: r.divisionId ? (division.get(r.divisionId) ?? "") : "", bunk: r.bunkId ? (bunk.get(r.bunkId) ?? "") : "" }))
      .sort((a, b) => Number(!a.div) - Number(!b.div) || compareDivisionNames(a.div, b.div) || Number(!a.bunk) - Number(!b.bunk) || compareBunkNames(a.bunk, b.bunk) || a.r.last.localeCompare(b.r.last) || a.r.first.localeCompare(b.r.first));
    const where =
      scope.kind === "all"
        ? camp.current && camp.camps.length > 1
          ? `All of ${camp.current.name}`
          : "Everyone"
        : scope.kind === "group"
          ? (tree.groups.find((g) => g.id === scope.id)?.name ?? "")
          : scope.kind === "division"
            ? (division.get(scope.id) ?? "")
            : `${division.get(scope.divisionId) ?? ""} · ${bunk.get(scope.id) ?? ""}`;
    const title = `${VIEWS[view]} · ${where}`;
    const header = simple ? ["Name", "Bunk"] : ["#", "Name", "Division", "Bunk", "Code", "Buzzer", "Flag", "Note", ...(contacts ? ["Parents' phones"] : [])];
    const full = list.map(({ r, div, bunk: b }, i) => [
      String(i + 1),
      r.heb ? `${r.heb} (${r.name})` : r.name,
      div,
      b,
      r.code,
      r.buzzer ? String(r.buzzer).padStart(3, "0") : "",
      flagText(r.id),
      followups[r.id]?.note ?? "",
      ...(contacts ? [r.phones.map((p) => `${p.label} ${p.phone}`).join(" · ")] : []),
    ]);
    const body = simple ? list.map(({ r, bunk: b }) => [r.heb ? `${r.heb} (${r.name})` : r.name, b]) : full;
    await logActivity("download", { what: `${title} (${pdf ? "PDF" : "Excel"})`, rows: body.length });
    if (!pdf) return tableDownload(title, [header, ...body], "xlsx");
    const { renderPdf } = await import("@/lib/print/chromium");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${(await import("@/lib/print/fonts")).embeddedFontCss()}
@page{size:letter ${simple ? "portrait" : "landscape"};margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:"Kinus Sans","Noto Sans","Noto Sans Hebrew",Arial,sans-serif;font-size:9pt;color:#111}
h1{font-size:15pt;margin:0 0 2pt}p{margin:0 0 8pt;color:#555;font-size:8.5pt}table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid}
th{text-align:start;font-weight:600;color:#555;font-size:8pt;border-bottom:1pt solid #999;padding:3pt 5pt 3pt 0}td{padding:3pt 5pt 3pt 0;border-bottom:.5pt solid #ddd;vertical-align:top;unicode-bidi:plaintext;text-align:start}
${simple ? "td{font-size:11pt;padding:4pt 8pt 4pt 0}" : "td:first-child{color:#888;width:6mm}"}
</style></head><body data-fitted><h1>${esc(title)}</h1><p>${body.length} ${body.length === 1 ? "camper" : "campers"} · ${esc(session.name ?? "")} · ${esc(formatDateTime(new Date().toISOString()))}</p>
<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((c) => `<td dir="auto">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    const { pdf: bytes } = await renderPdf(html);
    return told(new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": attachment(`${title}.pdf`), "Cache-Control": "no-store" } }), sp, "ok");
  } catch (e) {
    return pdfFailed(`Couldn't make the list: ${e instanceof Error ? e.message : String(e)}`, 500, sp);
  }
}
