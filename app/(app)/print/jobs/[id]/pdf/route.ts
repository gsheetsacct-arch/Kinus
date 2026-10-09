import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { visibleJob } from "@/lib/print/access";

/** The emailed PDF, from storage. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await visibleJob(id);
  if (!job?.pdf_path) return new NextResponse("No PDF for this job. Use Print instead.", { status: 404 });
  const { data, error } = await createAdminClient().storage.from("print-output").download(job.pdf_path);
  if (error || !data) return new NextResponse("The PDF couldn't be loaded.", { status: 502 });
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="kinus-${id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
