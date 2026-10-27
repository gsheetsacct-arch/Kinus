import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { connectorUser } from "@/lib/print/design-connectors";
import { loadUserById } from "@/lib/auth/user-by-id";
import { canDesign } from "@/lib/print/designers";
import { designServer } from "@/lib/print/design-mcp";

export const baseUrl = (request: NextRequest) => (process.env.APP_URL || request.nextUrl.origin).replace(/\/+$/, "");

/**
 * One request to the design connector (MCP over HTTP), for whoever `token` (a design link's
 * secret) stands for: it works only while that person may edit templates. Each request stands
 * alone (no sessions to keep). `unauthorized`: the answer without a valid token.
 */
export async function designRequest(request: NextRequest, token: string, unauthorized: (message: string) => NextResponse): Promise<Response> {
  const userId = await connectorUser(token);
  const user = userId ? await loadUserById(userId) : null;
  if (!user) return unauthorized("Not connected to Kinus, or the connection was removed. Connect again (Kinus: Print → Templates → Design with Claude).");
  if (!(await canDesign(user))) return NextResponse.json({ error: `${user.fullName} can't edit templates any more, so this connection doesn't work.` }, { status: 403 });
  const server = designServer(user, baseUrl(request));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
