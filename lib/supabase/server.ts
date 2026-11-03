import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

/** Supabase client bound to the current user's session cookies. RLS applies. */
export async function createClient() {
  const [cookieStore, via] = await Promise.all([cookies(), pageHeader()]);
  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    // the page a change was made from, for the activity log
    ...(via ? { global: { headers: { "x-kinus-via": via } } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the middleware refreshes sessions instead.
        }
      },
    },
  });
}

/** The page this request came from ("/campers/…"), as a header value (ASCII). */
async function pageHeader(): Promise<string | null> {
  try {
    const ref = (await headers()).get("referer");
    if (!ref) return null;
    const u = new URL(ref);
    return `${u.pathname}${u.search}`.replace(/[^\x20-\x7e]/g, (c) => encodeURIComponent(c)).slice(0, 200);
  } catch {
    return null;
  }
}
