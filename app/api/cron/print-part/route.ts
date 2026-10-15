import { after, NextResponse, type NextRequest } from "next/server";
import { processPrintJob, validPartToken } from "@/lib/print/jobs";

export const maxDuration = 60;

/**
 * Makes the next part of a big PDF in a run of its own (see processPrintJob). Only Kinus
 * itself can ask: the call carries a token signed with the server's own key.
 */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as { job?: string; part?: number; mark?: string; base?: string; token?: string };
  if (!b.job || !Number.isInteger(b.part) || !b.mark || !b.base || !b.token || !validPartToken(b.token, b.job, b.part!, b.mark, b.base)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const { job, part, mark, base } = b as Required<typeof b>;
  after(() => processPrintJob(job, base, { part, mark }));
  return NextResponse.json({ ok: true }, { status: 202 });
}
