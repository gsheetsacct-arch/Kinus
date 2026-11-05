import { NextResponse } from "next/server";

/**
 * Tells the page that asked (PdfButton) the download has started, or failed: a short cookie
 * named after the token in its "dl" parameter. A plain download link has no other way to know.
 */
export function told(res: NextResponse, sp: URLSearchParams, outcome: "ok" | "err") {
  const token = sp.get("dl");
  if (token && /^[a-z0-9]{6,24}$/.test(token)) res.cookies.set(`kdl_${token}`, outcome, { path: "/", maxAge: 120, sameSite: "lax" });
  return res;
}

/**
 * A PDF that couldn't be made. To a PDF button (dl=…): nothing to download (204, so the browser
 * doesn't save the message as a broken file, "pdf.txt"), and the button hears it failed; to
 * anything else, the message.
 */
export function pdfFailed(text: string, status: number, sp: URLSearchParams) {
  if (sp.get("dl")) return told(new NextResponse(null, { status: 204, headers: { "X-Kinus-Error": encodeURIComponent(text.slice(0, 300)) } }), sp, "err");
  return new NextResponse(text, { status });
}
