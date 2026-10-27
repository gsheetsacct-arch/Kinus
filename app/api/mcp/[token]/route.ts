import { NextResponse, type NextRequest } from "next/server";
import { designRequest } from "@/lib/print/design-mcp-handler";

export const maxDuration = 60;

/**
 * The design connector with a personal link (Templates → Design with Claude → Make a link):
 * the link's secret part says whose it is. /api/mcp is the same with sign-in instead.
 */
async function handle(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return designRequest(request, token, (error) => NextResponse.json({ error }, { status: 401 }));
}

export { handle as GET, handle as POST, handle as DELETE };
