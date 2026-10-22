import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/current-user";
import { fontFile } from "@/lib/print/custom-fonts";

/** An uploaded font's file, for the template editor (anyone signed in: tags show it on screen). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  await requireUser();
  const { file } = await params;
  if (!/^[\w.-]+$/.test(file)) return new NextResponse("Not found", { status: 404 });
  const got = await fontFile(`fonts/${file}`);
  if (!got) return new NextResponse("Not found", { status: 404 });
  // each upload has its own file name, so it never changes
  return new NextResponse(Buffer.from(got.bytes), { headers: { "Content-Type": got.type, "Cache-Control": "private, max-age=31536000, immutable" } });
}
