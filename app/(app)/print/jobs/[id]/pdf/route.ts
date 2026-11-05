import { logActivity } from "@/lib/audit/log";
import { NextResponse, type NextRequest } from "next/server";
import { pdfFailed, told } from "@/lib/print/download-signal";
import { createAdminClient } from "@/lib/supabase/admin";
import { visibleJob } from "@/lib/print/access";

/** The emailed PDF, from storage. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  // from a PDF button (dl=…): downloaded, and the button told when it starts
  const fail = (text: string, status: number) => pdfFailed(text, status, sp);
  const job = await visibleJob(id);
  if (!job?.pdf_path) return fail("No PDF for this job. Use Print instead.", 404);
  const { data, error } = await createAdminClient().storage.from("print-output").download(job.pdf_path);
  if (error || !data) return fail("The PDF couldn't be loaded.", 502);
  await logActivity("download", { what: "Print request PDF", job: id });
  const res = new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${sp.get("dl") ? "attachment" : "inline"}; filename="kinus-${id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" },
  });
  if (sp.get("mark") === "1") {
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    const user = await getCurrentUser();
    if (user) await (await import("@/lib/print/mark-printed")).markSentPrinted(user, [id]);
  }
  return told(res, sp, "ok");
}
