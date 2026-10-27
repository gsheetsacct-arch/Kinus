import { NextResponse, type NextRequest } from "next/server";
import { readClient, redeemCode } from "@/lib/oauth";
import { createConnector } from "@/lib/print/design-connectors";
import { loadUserById } from "@/lib/auth/user-by-id";
import { canDesign } from "@/lib/print/designers";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const problem = (error: string, error_description: string, status = 400) => NextResponse.json({ error, error_description }, { status, headers: { ...cors, "Cache-Control": "no-store" } });

/**
 * A code from the sign-in page (app/oauth/authorize) for the connection itself: a design link
 * for that person, listed on their Templates page ("Claude (connected)") and removable there.
 */
export async function POST(request: NextRequest) {
  const type = request.headers.get("content-type") ?? "";
  const raw = type.includes("application/json") ? ((await request.json().catch(() => ({}))) as Record<string, string>) : Object.fromEntries(new URLSearchParams(await request.text()));
  if (raw.grant_type !== "authorization_code") return problem("unsupported_grant_type", "Only authorization_code.");
  const client = readClient(raw.client_id ?? "");
  if (!client) return problem("invalid_client", "Unknown client_id: register first.", 401);
  // (a client with one return address may leave it out, as on the sign-in page)
  const redirectUri = raw.redirect_uri || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "");
  const userId = redeemCode(raw.code ?? "", raw.client_id, redirectUri, raw.code_verifier ?? "");
  if (!userId) return problem("invalid_grant", "The code isn't valid, is more than 5 minutes old, or doesn't match.");
  const user = await loadUserById(userId);
  if (!user || !(await canDesign(user))) return problem("invalid_grant", "That person can't edit templates.");
  const { token } = await createConnector(user.id, `${client.name} (connected)`, { replace: true });
  return NextResponse.json({ access_token: token, token_type: "Bearer", scope: "templates" }, { headers: { ...cors, "Cache-Control": "no-store" } });
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: cors });
