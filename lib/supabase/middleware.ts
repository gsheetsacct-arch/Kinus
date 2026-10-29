import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authRedirect } from "@/lib/auth/redirects";

// /api/mcp: the design connector, reached by Claude with a link of its own or its sign-in
// (/api/oauth, /.well-known: no sign-in cookie; the page where people allow it needs one).
// /updates: staff sign up for text updates, no account needed.
// /api/twilio: Twilio reports deliveries and replies (each request is signed; the route checks it).
// /api/render: Kinus asking its own PDF maker (signed with the server's key; the route checks it).
const PUBLIC_PATHS = ["/login", "/no-access", "/auth", "/set-password", "/api/webhooks", "/api/cron", "/api/mcp", "/api/oauth", "/.well-known", "/health", "/updates", "/privacy", "/terms", "/api/twilio", "/api/render"];

export async function updateSession(request: NextRequest) {
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `${request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`);
  const redirectTo = authRedirect(url, { canonical: process.env.APP_URL, production: process.env.VERCEL_ENV === "production" });
  if (redirectTo) return NextResponse.redirect(redirectTo, 307);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the session.
  // getClaims() verifies the token locally (asymmetric signing keys) instead of asking
  // the Auth server on every request; with legacy keys it falls back to that call.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // back to the same page after signing in, with what it was asked (Claude's sign-in page)
    url.search = "";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  // Signed-in people on /login are sent on by the page itself: only the browser can
  // see a sign-in token in the #fragment, and that must be handled first.
  return response;
}
