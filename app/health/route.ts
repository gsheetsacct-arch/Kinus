import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Public, no secrets: tells you whether the app can reach Supabase and whether the schema is applied. */
export async function GET(request: Request) {
  const out: Record<string, unknown> = {
    app: "ok",
    time: new Date().toISOString(),
    addressYouUsed: new URL(request.url).host,
    canonicalAddress: process.env.APP_URL ?? "not set (add APP_URL in Vercel → Settings → Environment Variables)",
  };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("settings").select("key").limit(1);
    if (error) {
      out.database = "reachable";
      out.schema = /relation .* does not exist|schema cache/i.test(error.message) ? "NOT APPLIED — run the migrations (docs/09-deployment.md §9.2)" : `error: ${error.message}`;
    } else {
      out.database = "ok";
      // the newest migration adds division_groups and profiles.role; older databases lack them
      const { error: latest } = await admin.from("profiles").select("role, all_areas").limit(1);
      out.schema = latest ? "OUT OF DATE: run the newest migration in supabase/migrations (staff sign-in fails until then)" : "applied";
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
