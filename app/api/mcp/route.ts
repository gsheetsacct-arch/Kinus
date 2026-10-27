import { NextResponse, type NextRequest } from "next/server";
import { baseUrl, designRequest } from "@/lib/print/design-mcp-handler";

export const maxDuration = 60;

/**
 * The design connector at one address for everyone: an organization adds
 * https://<kinus>/api/mcp to Claude once, and each person connects it to their own account
 * (Claude sends them to Kinus to sign in and allow it: app/oauth/authorize). Without a valid
 * sign-in, the answer says where to sign in (RFC 9728), which starts that in Claude.
 */
async function handle(request: NextRequest) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  return designRequest(request, token, (error) =>
    NextResponse.json(
      { error: "invalid_token", error_description: error },
      { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${baseUrl(request)}/.well-known/oauth-protected-resource/api/mcp"` } },
    ),
  );
}

export { handle as GET, handle as POST, handle as DELETE };
