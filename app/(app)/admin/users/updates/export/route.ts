import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isDirector } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { exportFormat, tableDownload } from "@/lib/export";
import { formatDateTime } from "@/lib/utils";

/** Everyone signed up for updates, with their consent: Excel (?format=xlsx) or CSV. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isDirector(user)) return new NextResponse("Not allowed.", { status: 403 });
  const { data, error } = await createAdminClient().from("update_signups").select("full_name, phone_e164, consented_at, consent_text").order("full_name");
  if (error) return new NextResponse(error.message, { status: 500 });
  const rows = [["Name", "Phone", "Agreed on", "What they agreed to"], ...(data ?? []).map((r) => [r.full_name, r.phone_e164, formatDateTime(r.consented_at), r.consent_text])];
  return tableDownload("Staff updates sign-ups", rows, exportFormat(request.nextUrl.searchParams.get("format")));
}
