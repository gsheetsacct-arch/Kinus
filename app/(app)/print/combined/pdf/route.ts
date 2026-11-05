import { logActivity } from "@/lib/audit/log";
import { NextResponse, type NextRequest } from "next/server";
import { parseOrder } from "@/lib/print/data";
import { combinedSetPdf } from "@/lib/print/jobs";
import { visibleJobs } from "@/lib/print/access";
import { waitingIds } from "@/lib/print/waiting-ids";

export const maxDuration = 60;

/**
 * Tells the page that asked (PdfButton) the download has started, or failed: a short cookie
 * named after its token. A plain download link has no other way to know.
 */
function told(res: NextResponse, sp: URLSearchParams, outcome: "ok" | "err") {
  const token = sp.get("dl");
  if (token && /^[a-z0-9]{6,24}$/.test(token)) res.cookies.set(`kdl_${token}`, outcome, { path: "/", maxAge: 120, sameSite: "lax" });
  return res;
}

/** A combined set (see /print/combined) as a PDF to download. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const fail = (text: string, status: number) => told(new NextResponse(text, { status }), sp, "err");
  const ids = sp.get("waiting") ? await waitingIds(sp) : (sp.get("jobs") ?? "").split(",").filter(Boolean).slice(0, 600);
  if (!ids) return fail("Not found", 404);
  if (!ids.length) return fail("Nothing waiting to print.", 400);
  if (!(await visibleJobs(ids))) return fail("Not found", 404);
  try {
    const r = await combinedSetPdf(ids, { order: sp.get("order") ? parseOrder(sp.get("order")) : undefined, part: Number(sp.get("part")) > 0 ? Math.floor(Number(sp.get("part"))) : undefined });
    await logActivity("download", { what: `Labels PDF: ${r.fileName}`, jobs: ids.length, waiting: sp.get("waiting") ?? undefined, part: sp.get("part") ?? undefined });
    const ascii = r.fileName.replace(/[^\x20-\x7e]+/g, "_").replace(/"/g, "");
    const res = new NextResponse(new Uint8Array(r.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`, "Cache-Control": "private, no-store" },
    });
    return told(res, sp, "ok");
  } catch (e) {
    console.error("Merged labels PDF failed", e);
    return fail(e instanceof Error ? e.message : "Couldn't make the PDF.", 400);
  }
}
