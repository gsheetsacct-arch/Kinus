import { logActivity } from "@/lib/audit/log";
import { NextResponse, type NextRequest } from "next/server";
import { parseOrder } from "@/lib/print/data";
import { combinedSetPdf } from "@/lib/print/jobs";
import { visibleJobs } from "@/lib/print/access";
import { waitingIds } from "@/lib/print/waiting-ids";

export const maxDuration = 60;

/** A combined set (see /print/combined) as a PDF to download. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ids = sp.get("waiting") ? await waitingIds(sp) : (sp.get("jobs") ?? "").split(",").filter(Boolean).slice(0, 600);
  if (!ids) return new NextResponse("Not found", { status: 404 });
  if (!ids.length) return new NextResponse("Nothing waiting to print.", { status: 400 });
  if (!(await visibleJobs(ids))) return new NextResponse("Not found", { status: 404 });
  try {
    const r = await combinedSetPdf(ids, { order: sp.get("order") ? parseOrder(sp.get("order")) : undefined, part: Number(sp.get("part")) > 0 ? Math.floor(Number(sp.get("part"))) : undefined });
    await logActivity("download", { what: `Labels PDF: ${r.fileName}`, jobs: ids.length, waiting: sp.get("waiting") ?? undefined, part: sp.get("part") ?? undefined });
    const ascii = r.fileName.replace(/[^\x20-\x7e]+/g, "_").replace(/"/g, "");
    return new NextResponse(new Uint8Array(r.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("Merged labels PDF failed", e);
    return new NextResponse(e instanceof Error ? e.message : "Couldn't make the PDF.", { status: 400 });
  }
}
