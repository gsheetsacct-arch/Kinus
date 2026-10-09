/**
 * Pure routing rules for sign-in links, kept separate so they are unit-tested.
 *
 * 1. One canonical address. In production, any other host serving this app (for
 *    example kinus-team.vercel.app when the chosen address is kinus.vercel.app) is
 *    redirected to the canonical one, keeping path and query. Browsers keep the
 *    #fragment across redirects, so sign-in tokens survive too. Sessions are stored
 *    per domain, so this is what keeps people signed in.
 * 2. Stray sign-in parameters. If Supabase falls back to the Site URL, a `?code=` or
 *    `?token_hash=` can land on any page; send it to the handler that completes it.
 */
export function authRedirect(url: URL, env: { canonical?: string | null; production: boolean }): string | null {
  if (env.canonical && env.production && !url.pathname.startsWith("/api/")) {
    const c = new URL(env.canonical);
    if (url.host !== c.host) return new URL(url.pathname + url.search, c.origin).toString();
  }
  const code = url.searchParams.get("code");
  if (code && url.pathname !== "/auth/callback") {
    const next = url.pathname === "/" || url.pathname === "/login" ? url.searchParams.get("next") ?? "/" : url.pathname;
    return new URL(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`, url.origin).toString();
  }
  if (url.searchParams.get("token_hash") && url.pathname !== "/auth/confirm") {
    return new URL(`/auth/confirm${url.search}`, url.origin).toString();
  }
  return null;
}
