import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authRedirect } from "@/lib/auth/redirects";

const PUBLIC_PATHS = ["/login", "/no-access", "/auth", "/set-password", "/api/webhooks", "/api/cron", "/health"];

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

  // Do not run code between createServerClient and getUser(): it refreshes the session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  // Signed-in people on /login are sent on by the page itself: only the browser can
  // see a sign-in token in the #fragment, and that must be handled first.
  return response;
}
