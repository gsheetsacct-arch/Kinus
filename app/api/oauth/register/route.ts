import { NextResponse, type NextRequest } from "next/server";
import { allowedRedirect, registerClient } from "@/lib/oauth";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const problem = (error_description: string) => NextResponse.json({ error: "invalid_client_metadata", error_description }, { status: 400, headers: cors });

/** Claude registers itself (RFC 7591): only Claude's own return addresses are taken. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { client_name?: unknown; redirect_uris?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 5) return problem("Give one to five redirect_uris.");
  const bad = uris.find((u) => !allowedRedirect(u));
  if (bad) return problem(`Kinus connects only to Claude: ${bad} isn't a Claude address.`);
  const name = typeof body?.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "Claude";
  const clientId = registerClient({ name, redirect_uris: uris });
  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: cors },
  );
}

export const OPTIONS = () => new NextResponse(null, { status: 204, headers: cors });
