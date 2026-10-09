import { headers } from "next/headers";

/**
 * The address to put in emailed links. Prefers APP_URL (the canonical address, set
 * in Vercel), otherwise the address the person is using right now, so a link never
 * sends them to a different domain than the one they are signed in on.
 */
export async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")}://${host}`;
  } catch {
    // not in a request
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
