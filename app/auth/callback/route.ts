import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** PKCE code exchange target for magic links and invites (`emailRedirectTo`). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
    const msg = /code verifier|both auth code and code verifier/i.test(error.message)
      ? "That sign-in link was opened in a different browser than the one that asked for it. Request a new link here."
      : error.message;
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  }
  // No code: the session may be in the URL #fragment (implicit flow). The browser keeps
  // the fragment across this redirect and the login page completes the sign-in.
  return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(next)}`);
}
