import { logActivity } from "@/lib/audit/log";
import { NextResponse, type NextRequest } from "next/server";
import { parseOrder } from "@/lib/print/data";
import { combinedSetHtml } from "@/lib/print/jobs";
import { visibleJobs } from "@/lib/print/access";
import { waitingIds } from "@/lib/print/waiting-ids";

export const maxDuration = 60;

/**
 * Requests for different label-printer templates printed as sets, each camper's labels one
 * after another: ?jobs=a,b,c, or ?waiting=<label size> for all still to print (see waitingIds);
 * [&order=bunk|division|name]. The page prints itself once every
 * name has been fitted.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ids = sp.get("waiting") ? await waitingIds(sp) : (sp.get("jobs") ?? "").split(",").filter(Boolean).slice(0, 600);
  if (!ids) return new NextResponse("Not found", { status: 404 });
  if (!ids.length) return new NextResponse("Nothing waiting to print.", { status: 400 });
  if (!(await visibleJobs(ids))) return new NextResponse("Not found", { status: 404 });
  try {
    const html = await combinedSetHtml(ids, { order: sp.get("order") ? parseOrder(sp.get("order")) : undefined });
    await logActivity("print", { what: `Printed as sets: ${ids.length} requests`, waiting: sp.get("waiting") ?? undefined, order: sp.get("order") ?? undefined });
    const script = `<script>(function w(){document.body.getAttribute("data-fitted")?setTimeout(function(){window.print()},200):setTimeout(w,100)})()</script>`;
    return new NextResponse(html.replace("</body>", `${script}</body>`), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Couldn't make the page.", { status: 400 });
  }
}
