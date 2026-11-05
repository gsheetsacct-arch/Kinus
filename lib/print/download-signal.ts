import type { NextResponse } from "next/server";

/**
 * Tells the page that asked (PdfButton) the download has started, or failed: a short cookie
 * named after the token in its "dl" parameter. A plain download link has no other way to know.
 */
export function told(res: NextResponse, sp: URLSearchParams, outcome: "ok" | "err") {
  const token = sp.get("dl");
  if (token && /^[a-z0-9]{6,24}$/.test(token)) res.cookies.set(`kdl_${token}`, outcome, { path: "/", maxAge: 120, sameSite: "lax" });
  return res;
}
