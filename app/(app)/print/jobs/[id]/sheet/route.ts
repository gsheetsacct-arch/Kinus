import { NextResponse, type NextRequest } from "next/server";
import { jobHtml } from "@/lib/print/jobs";
import { visibleJob } from "@/lib/print/access";

export const maxDuration = 60;

/** The job as a printable page; with ?print=1 the browser's print dialog opens by itself. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await visibleJob(id))) return new NextResponse("Not found", { status: 404 });
  const { html } = await jobHtml(id);
  const auto = request.nextUrl.searchParams.get("print") === "1";
  // print once the names have been shrunk to fit (the page sets data-fitted)
  const script = auto ? `<script>(function w(){document.body.getAttribute("data-fitted")?setTimeout(function(){window.print()},200):setTimeout(w,100)})()</script>` : "";
  return new NextResponse(html.replace("</body>", `${script}</body>`), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
