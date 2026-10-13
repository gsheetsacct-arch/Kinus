import { NextResponse, type NextRequest } from "next/server";
import { printSetHtml } from "@/lib/print/jobs";
import { visibleJob } from "@/lib/print/access";

export const maxDuration = 60;

/**
 * Requests printed together (same template) as one printable page:
 * ?jobs=a,b,c[&division=<id>|none][&start=<label number on a part-used sheet>][&print=1]
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ids = (sp.get("jobs") ?? "").split(",").filter(Boolean).slice(0, 300);
  if (!ids.length) return new NextResponse("Nothing to print.", { status: 400 });
  for (const id of ids) if (!(await visibleJob(id))) return new NextResponse("Not found", { status: 404 });
  const division = sp.get("division");
  try {
    const html = await printSetHtml(ids, { start: Number(sp.get("start")) || undefined, divisionId: division === null ? undefined : division === "none" ? null : division });
    const auto = sp.get("print") === "1";
    const script = auto ? `<script>(function w(){document.body.getAttribute("data-fitted")?setTimeout(function(){window.print()},200):setTimeout(w,100)})()</script>` : "";
    return new NextResponse(html.replace("</body>", `${script}</body>`), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Couldn't make the page.", { status: 400 });
  }
}
