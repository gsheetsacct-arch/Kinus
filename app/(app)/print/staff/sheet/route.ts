import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { toSpec } from "@/lib/print/data";
import { parseOrder, sortStaff } from "@/lib/print/order";
import { forCampers } from "@/lib/print/staff-values";
import { staffInView, staffSheetHtml } from "@/lib/print/staff";
import { staffValues } from "@/lib/print/staff-values";

const PRINT_SCRIPT = `<script>(function w(){document.body.getAttribute("data-fitted")?setTimeout(function(){window.print()},200):setTimeout(w,100)})()</script>`;
const HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

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
  // blank badges: a division's design with no name, so many (staff not on the list yet)
  const blank = Math.min(300, Math.max(0, Math.round(Number(form.get("blank")) || 0)));
  const blankDivision = String(form.get("blank_division") ?? "").trim().slice(0, 100);
  if (!/^[0-9a-f-]{36}$/i.test(templateId) || (!ids.size && !(blank && blankDivision))) return new NextResponse("Pick a template and who to print for.", { status: 400 });
  const { data: t } = await createAdminClient().from("print_templates").select("*").eq("id", templateId).maybeSingle();
  if (!t || forCampers(t)) return new NextResponse("That isn't a staff template.", { status: 404 });
  if (blank && blankDivision) {
    const values = staffValues({ name: "", role: "staff", title: null, phone: null, email: null, details: { "Division (name tag)": blankDivision }, places: [] }, () => "");
    const html = await staffSheetHtml(toSpec(t), Array.from({ length: blank }, () => ({ values, copies: 1 })));
    return new NextResponse(html.replace("</body>", `${PRINT_SCRIPT}</body>`), { headers: HEADERS });
  }
  const people = sortStaff((await staffInView(user)).filter((p) => ids.has(p.id)), parseOrder(String(form.get("order") ?? "")));
  if (!people.length) return new NextResponse("None of those people are yours to print for.", { status: 404 });
  const spec = toSpec(t);
  const html = await staffSheetHtml(form.get("single") === "1" ? { ...spec, sheet_layout: null } : spec, people.map((p) => ({ values: p.values, copies })));
  return new NextResponse(html.replace("</body>", `${PRINT_SCRIPT}</body>`), { headers: HEADERS });
}
