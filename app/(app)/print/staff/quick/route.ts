import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/audit/log";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canUsePrintArea, isStaffManager } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { pdfFailed, told } from "@/lib/print/download-signal";
import { forCampers } from "@/lib/print/staff-values";
import { staffSheetHtml } from "@/lib/print/staff";
import { cleanQuickTag, quickTagSpec } from "@/lib/print/quick-tag";
import { attachment } from "@/lib/utils";

export const maxDuration = 60;

const PRINT_SCRIPT = `<script>(function w(){document.body.getAttribute("data-fitted")?setTimeout(function(){window.print()},200):setTimeout(w,100)})()</script>`;

/** The font the staff thermal tags use (the first 50 × 80 thermal staff template's name), so a quick tag looks like the rest. */
async function staffTagFont(): Promise<string> {
  const { data } = await createAdminClient()
    .from("print_templates")
    .select("*")
    .eq("thermal", true)
    .not("name", "like", "(retired)%")
    .order("sort_order")
    .order("name");
  const t =
    (data ?? []).find(
      (r) =>
        !forCampers(r) &&
        Number(r.page_width_mm) === 50 &&
        Number(r.page_height_mm) === 80 &&
        !r.name.startsWith("(one-off)"),
    ) ?? (data ?? []).find((r) => !forCampers(r));
  const name = (
    (t?.layers as { id?: string; type?: string; font?: string }[] | null) ?? []
  ).find((l) => l.type === "text" && l.font);
  return name?.font ?? "sans";
}

/**
 * A staff tag made on the spot (Print → Staff tags → Quick staff tag): what's typed in (?top,
 * ?name, ?line2, ?line3, ?qr a link for a QR code) on a 50 × 80 thermal tag. ?format=pdf
 * downloads it (for the label printer app), otherwise the page prints (?preview=1: only shows).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const user = await getCurrentUser();
  // the print area, or the Staff page (staff managers): nothing is saved, it's only a tag
  if (!user || user.checkinLogin || !(canUsePrintArea(user) || isStaffManager(user)))
    return pdfFailed("Not allowed.", 403, sp);
  const tag = cleanQuickTag(Object.fromEntries(sp));
  if (!tag.name && !tag.line2 && !tag.line3)
    return pdfFailed("Type a name.", 400, sp);
  const copies = Math.min(
    10,
    Math.max(1, Math.round(Number(sp.get("copies")) || 1)),
  );
  try {
    const preview = sp.get("preview") === "1" && sp.get("format") !== "pdf";
    const spec = quickTagSpec(tag, await staffTagFont());
    // the preview shows the tag upright, alone, on white (printing turns it for the label printer)
    const html = preview
      ? (
          await staffSheetHtml({ ...spec, thermal: false }, [
            { values: {}, copies: 1 },
          ])
        ).replace(
          "</head>",
          "<style>@media screen{body{background:#fff;padding:0;margin:0}.tag{box-shadow:none}}</style></head>",
        )
      : await staffSheetHtml(spec, [{ values: {}, copies }]);
    if (sp.get("format") !== "pdf") {
      if (!preview)
        await logActivity("print", {
          what: `Quick staff tag: ${tag.name}`,
          copies,
        });
      return new NextResponse(
        preview
          ? html
          : html.replace("</body>", `${PRINT_SCRIPT}</body>`),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex",
          },
        },
      );
    }
    const { renderPdf } = await import("@/lib/print/chromium");
    const { pdf } = await renderPdf(html);
    await logActivity("download", {
      what: `Quick staff tag: ${tag.name} (PDF)`,
      copies,
    });
    return told(
      new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": attachment(
            `Staff tag - ${tag.name || "quick"}.pdf`,
          ),
          "Cache-Control": "no-store",
        },
      }),
      sp,
      "ok",
    );
  } catch (e) {
    return pdfFailed(
      `Couldn't make the tag: ${e instanceof Error ? e.message : String(e)}`,
      500,
      sp,
    );
  }
}
