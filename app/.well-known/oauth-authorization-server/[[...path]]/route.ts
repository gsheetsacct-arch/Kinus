import { NextResponse, type NextRequest } from "next/server";
import { baseUrl } from "@/lib/print/design-mcp-handler";

/** How Claude signs someone in to the design connector (RFC 8414; lib/oauth). */
export function GET(request: NextRequest) {
  const base = baseUrl(request);
  return NextResponse.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["templates"],
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
