import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { connectorUser } from "@/lib/print/design-connectors";
import { actingAs } from "@/lib/audit/actor";
import { loadUserById } from "@/lib/auth/user-by-id";
import { canDesign } from "@/lib/print/designers";
import { designServer } from "@/lib/print/design-mcp";
import { canConnect } from "@/lib/ai/connect";

export const baseUrl = (request: NextRequest) => (process.env.APP_URL || request.nextUrl.origin).replace(/\/+$/, "");

/**
 * One request to the design connector (MCP over HTTP), for whoever `token` (a design link's
 * secret) stands for: anyone with their own sign-in (the template tools only for those who may
 * edit templates). Each request stands
 * alone (no sessions to keep). `unauthorized`: the answer without a valid token.
 */
export async function designRequest(request: NextRequest, token: string, unauthorized: (message: string) => NextResponse): Promise<Response> {
  // No sessions, so nothing to stream: a GET would open an event stream that never ends, and
  // keep a function running until it times out (then Claude opens another, all day long).
  // 405 tells clients there's no stream (the MCP spec's answer); everything works over POST.
  if (request.method !== "POST") return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
  const userId = await connectorUser(token);
  const user = userId ? await loadUserById(userId) : null;
  if (!user) return unauthorized("Not connected to Kinus, or the connection was removed. Connect again (Kinus: Connect your AI).");
  if (!canConnect(user)) return NextResponse.json({ error: `${user.fullName}'s account can't be connected (a check-in login).` }, { status: 403 });
  // the template tools only for people who may edit templates
  const designer = await canDesign(user);
  // what it changes is logged as this person's, from Claude
  return actingAs({ id: user.id, via: "Claude connector" }, async () => {
    const server = designServer(user, baseUrl(request), { designer });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(request);
  });
}
