import { NextResponse, type NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { connectorUser } from "@/lib/print/design-connectors";
import { loadUserById } from "@/lib/auth/user-by-id";
import { canDesign } from "@/lib/print/designers";
import { designServer } from "@/lib/print/design-mcp";

export const maxDuration = 60;

/**
 * The design connector (MCP over HTTP): someone's Claude designs Kinus templates. The link's
 * secret part says whose it is (Templates → Design with Claude); it works only while that
 * person may edit templates. Each request stands alone (no sessions to keep).
 */
async function handle(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await connectorUser(token);
  const user = userId ? await loadUserById(userId) : null;
  if (!user) return NextResponse.json({ error: "This design link isn't valid any more. Make a new one in Kinus: Print → Templates → Design with Claude." }, { status: 401 });
  if (!(await canDesign(user))) return NextResponse.json({ error: `${user.fullName} can't edit templates any more, so this link doesn't work.` }, { status: 403 });
  const base = (process.env.APP_URL || request.nextUrl.origin).replace(/\/+$/, "");
  const server = designServer(user, base);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
