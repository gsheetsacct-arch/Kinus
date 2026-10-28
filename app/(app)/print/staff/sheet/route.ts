import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { toSpec } from "@/lib/print/data";
import { forCampers } from "@/lib/print/staff-values";
import { staffInView, staffSheetHtml } from "@/lib/print/staff";

export const maxDuration = 60;

/**
 * Staff tags as one printable page (Print → Staff tags): the form posts the template, who
 * (ids, only staff this person may print for are used), copies and one-a-page; the browser
 * prints the page as soon as every name has been fitted.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUsePrintArea(user)) return new NextResponse("Not allowed.", { status: 403 });
  const form = await request.formData();
  const templateId = String(form.get("template") ?? "");
  const ids = new Set(form.getAll("ids").map(String));
  const copies = Math.min(10, Math.max(1, Math.round(Number(form.get("copies")) || 1)));
  if (!/^[0-9a-f-]{36}$/i.test(templateId) || !ids.size) return new NextResponse("Pick a template and who to print for.", { status: 400 });
  const { data: t } = await createAdminClient().from("print_templates").select("*").eq("id", templateId).maybeSingle();
  if (!t || forCampers(t)) return new NextResponse("That isn't a staff template.", { status: 404 });
  const people = (await staffInView(user)).filter((p) => ids.has(p.id));
  if (!people.length) return new NextResponse("None of those people are yours to print for.", { status: 404 });
  const spec = toSpec(t);
  const html = await staffSheetHtml(form.get("single") === "1" ? { ...spec, sheet_layout: null } : spec, people.map((p) => ({ values: p.values, copies })));
  const script = `<script>(function w(){document.body.getAttribute("data-fitted")?setTimeout(function(){window.print()},200):setTimeout(w,100)})()</script>`;
  return new NextResponse(html.replace("</body>", `${script}</body>`), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
