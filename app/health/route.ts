import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Public, no secrets: tells you whether the app can reach Supabase and whether the schema is applied. */
export async function GET() {
  const out: Record<string, unknown> = { app: "ok", time: new Date().toISOString() };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("settings").select("key").limit(1);
    if (error) {
      out.database = "reachable";
      out.schema = /relation .* does not exist|schema cache/i.test(error.message) ? "NOT APPLIED — run the migrations (docs/09-deployment.md §9.2)" : `error: ${error.message}`;
    } else {
      out.database = "ok";
      out.schema = "applied";
      const [{ count: profiles }, { data: session }] = await Promise.all([
        admin.from("profiles").select("id", { count: "exact", head: true }),
        admin.from("sessions").select("name").eq("is_active", true).maybeSingle(),
      ]);
      out.staffAccounts = profiles ?? 0;
      out.activeSession = session?.name ?? null;
    }
  } catch (e) {
    out.database = `error: ${e instanceof Error ? e.message : String(e)}`;
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
