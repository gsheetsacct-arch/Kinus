import "server-only";
import { embeddedFontCss } from "@/lib/print/fonts";
import { formatDateTime } from "@/lib/utils";
import type { BuiltList } from "@/lib/data/lists";
import { printsLandscape } from "./orientation";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cell = (v: string | boolean | null) => esc(typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? ""));

/** Margin around every printed (and downloaded) list page. */
export const LIST_PAGE_MARGIN = "15mm";

/**
 * A list as one printable page for the PDF download: the cover (what it is, for whom, how many,
 * when), then each group on its own page, `copies` times, like printing it from the page.
 * Wide lists (more than 10 columns) go sideways and a little smaller.
 */
export function listHtml(list: BuiltList, o: { session: string | null; camp: string | null; by: string; copies: number }): string {
  const wide = printsLandscape(list.preset.orientation, list.columns.length);
  const campers = list.groups.reduce((n, g) => n + g.rows.length, 0);
  const named = list.groups.filter((g) => g.title);
  const kind = list.preset.group_by === "bunk" ? "bunks" : list.preset.group_by === "division" ? "divisions" : "groups";
  const top = [o.session, o.camp && o.camp !== o.session ? `${o.camp} camp` : null].filter(Boolean).join(" · ");
  const cover = `<section class="cover"><div class="mid">${top ? `<p class="top">${esc(top)}</p>` : ""}<h1 dir="auto">${esc(list.preset.name)}</h1><p class="scope" dir="auto">${esc(list.scopeLabel)}</p><p class="count">${campers} ${campers === 1 ? "camper" : "campers"}${named.length > 1 ? ` · ${named.length} ${kind}` : ""}${o.copies > 1 ? ` · ${o.copies} copies of each` : ""}</p>${named.length > 1 ? `<p class="groups" dir="auto">${esc(named.map((g) => `${g.title} (${g.rows.length})`).join(" · "))}</p>` : ""}</div><p class="foot">Printed ${esc(formatDateTime(new Date().toISOString()))} by ${esc(o.by)} · Kinus</p></section>`;
  const head = `<thead><tr><th class="n">#</th>${list.columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>`;
  const groups = list.groups
    .flatMap((g) => Array.from({ length: Math.max(1, o.copies) }, () => g))
    .map(
      (g) =>
        `<section class="group">${g.title ? `<h2 dir="auto">${esc(g.title)} <span>(${g.rows.length})</span></h2>` : ""}${g.staff ? `<p class="staff" dir="auto">${g.staff.length === 1 ? "Counselor" : "Counselors"}: ${esc(g.staff.join(" · "))}</p>` : ""}<table>${head}<tbody>${g.rows.map((r, i) => `<tr><td class="n">${i + 1}</td>${r.cells.map((v) => `<td dir="auto">${cell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`,
    )
    .join("");
  const size = list.columns.length > 16 ? 6.5 : list.columns.length > 10 ? 8 : 9.5;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(list.preset.name)}</title><style>
${embeddedFontCss()}
@page{size:letter ${wide ? "landscape" : "portrait"};margin:${LIST_PAGE_MARGIN}}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111}
body{font-family:"Kinus Sans","Noto Sans","Noto Sans Hebrew",Arial,sans-serif;font-size:${size}pt}
.cover{height:${wide ? 150 : 215}mm;display:flex;flex-direction:column;text-align:center;break-after:page}
.cover .mid{margin:auto 0}.top{font-size:10pt;letter-spacing:.2em;text-transform:uppercase;color:#737373}
h1{font-size:34pt;margin:12pt 0 0}.scope{font-size:15pt;margin:10pt 0 0}.count{font-size:13pt;margin:16pt 0 0}
.groups{font-size:9.5pt;color:#525252;max-width:170mm;margin:10pt auto 0;line-height:1.5}.foot{font-size:8pt;color:#737373}
.group+.group{break-before:page}h2{font-size:13pt;margin:0 0 4pt}h2 span{font-size:9.5pt;font-weight:400;color:#737373}
.staff{margin:0 0 6pt;color:#525252}
table{width:100%;border-collapse:collapse;${list.columns.length > 10 ? "table-layout:fixed;" : ""}}thead{display:table-header-group}tr{break-inside:avoid}
th{text-align:start;font-weight:500;color:#525252;font-size:.85em;padding:2pt 6pt 2pt 0;border-bottom:.6pt solid #d4d4d4}
td{padding:2.5pt 6pt 2.5pt 0;vertical-align:top;border-bottom:.5pt dashed #d4d4d4;text-align:start;unicode-bidi:plaintext;white-space:pre-line;overflow-wrap:anywhere}
.n{width:7mm;color:#737373;font-size:.85em}
</style></head><body data-fitted>${cover}${groups}</body></html>`;
}
