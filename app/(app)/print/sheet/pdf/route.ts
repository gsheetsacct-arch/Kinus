import { NextResponse, type NextRequest } from "next/server";
import { printSetPdf } from "@/lib/print/jobs";
import { visibleJobs } from "@/lib/print/access";

export const maxDuration = 60;

/**
 * The print page as a PDF to download (same options as /print/sheet), one part at a time:
 * &part=0,1,… The answer says how many parts there are (X-Kinus-Parts) and the file's name
 * (X-Kinus-File); the print panel fetches them all and joins them into one file.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ids = (sp.get("jobs") ?? "").split(",").filter(Boolean).slice(0, 300);
  if (!ids.length) return new NextResponse("Nothing to print.", { status: 400 });
  if (!(await visibleJobs(ids))) return new NextResponse("Not found", { status: 404 });
  const division = sp.get("division");
  const used = sp.get("used");
  try {
    const r = await printSetPdf(ids, {
      used: used === null ? undefined : used.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0),
      divisionId: division === null ? undefined : division === "none" ? null : division,
      copies: Number(sp.get("copies")) || undefined,
      single: sp.get("single") === "1",
      part: Number(sp.get("part")) || 0,
    });
    const ascii = r.fileName.replace(/[^\x20-\x7e]+/g, "_").replace(/"/g, "");
    return new NextResponse(new Uint8Array(r.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
        "X-Kinus-Parts": String(r.parts),
        "X-Kinus-File": encodeURIComponent(r.fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Couldn't make the PDF.", { status: 400 });
  }
}
