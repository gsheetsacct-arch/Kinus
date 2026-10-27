import { NextResponse, type NextRequest } from "next/server";
import { baseUrl } from "@/lib/print/design-mcp-handler";

/** What the design connector (/api/mcp) is and where to sign in for it (RFC 9728). */
export function GET(request: NextRequest) {
  const base = baseUrl(request);
  return NextResponse.json(
    { resource: `${base}/api/mcp`, authorization_servers: [base], bearer_methods_supported: ["header"], scopes_supported: ["templates"], resource_name: "Kinus templates" },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
