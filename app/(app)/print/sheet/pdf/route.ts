import { logActivity } from "@/lib/audit/log";
import { parseOrder } from "@/lib/print/data";
import { NextResponse, type NextRequest } from "next/server";
import { printSetPdf } from "@/lib/print/jobs";
import { visibleJobs } from "@/lib/print/access";
import { pdfFailed, told } from "@/lib/print/download-signal";

export const maxDuration = 60;

/**
 * The print page as a PDF to download (same options as /print/sheet), one part at a time:
 * &part=0,1,… The answer says how many parts there are (X-Kinus-Parts) and the file's name
 * (X-Kinus-File); the print panel fetches them all and joins them into one file.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ids = (sp.get("jobs") ?? "").split(",").filter(Boolean).slice(0, 300);
  // a PDF button's dl=… hears whether it worked (download-signal)
  const fail = (text: string, status: number) => pdfFailed(text, status, sp);
  if (!ids.length) return fail("Nothing to print.", 400);
  if (!(await visibleJobs(ids))) return fail("Not found", 404);
  const division = sp.get("division");
  const used = sp.get("used");
  try {
    const r = await printSetPdf(ids, {
      used: used === null ? undefined : used.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0),
      divisionId: division === null ? undefined : division === "none" ? null : division,
      copies: Number(sp.get("copies")) || undefined,
      single: sp.get("single") === "1",
      // the page's choice, else the order the request was made with
      order: sp.get("order") ? parseOrder(sp.get("order")) : undefined,
      part: Number(sp.get("part")) || 0,
    });
    if (!Number(sp.get("part"))) await logActivity("download", { what: `Labels PDF: ${r.fileName}`, jobs: ids, parts: r.parts });
    const ascii = r.fileName.replace(/[^\x20-\x7e]+/g, "_").replace(/"/g, "");
    // "Download PDF and mark printed" (one part: the whole request): marked as it's sent
    if (sp.get("mark") === "1" && r.parts === 1) {
      const { getCurrentUser } = await import("@/lib/auth/current-user");
      const user = await getCurrentUser();
      if (user) await (await import("@/lib/print/mark-printed")).markSentPrinted(user, ids);
    }
    const res = new NextResponse(new Uint8Array(r.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
        "X-Kinus-Parts": String(r.parts),
        "X-Kinus-File": encodeURIComponent(r.fileName),
        "Cache-Control": "private, no-store",
      },
    });
    return told(res, sp, "ok");
  } catch (e) {
    console.error("Sheet labels PDF failed", e);
    return fail(e instanceof Error ? e.message : "Couldn't make the PDF.", 400);
  }
}
