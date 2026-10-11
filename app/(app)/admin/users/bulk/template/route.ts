import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, getCurrentUser } from "@/lib/auth/current-user";
import { canManageRole, isStaffManager } from "@/lib/auth/permissions";
import { ROLE_ORDER } from "@/lib/labels";
import { grantableTree, loadAreaTree } from "@/lib/data/areas";
import { TEMPLATE_HEADERS, templateRows, toCsv } from "@/lib/staff/template";

/** A ready-to-fill staff sheet (CSV, opens in Excel/Google Sheets) with this person's own divisions and bunks in the examples. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me || !isStaffManager(me)) return new NextResponse("Not allowed.", { status: 403 });
  const tree = grantableTree(me, await loadAreaTree(createAdminClient(), (await getActiveSession())?.id));
  const roles = ROLE_ORDER.filter((r) => canManageRole(me, r));
  return new NextResponse(toCsv([TEMPLATE_HEADERS, ...templateRows(tree, roles)]), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="kinus-staff-template.csv"', "Cache-Control": "private, no-store" },
  });
}
