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
      // each check is something a migration added; the first one missing names what to run
      const { error: staff } = await admin.from("profiles").select("role, all_areas").limit(1);
      const { error: fast } = staff ? { error: null } : await admin.rpc("my_level_rank");
      const { error: followups } = staff || fast ? { error: null } : await admin.from("camper_followups").select("camper_id").limit(1);
      const labels = staff || fast || followups ? null : (await admin.from("print_templates").select("id").eq("id", "d0000000-0000-0000-0000-000000000003").maybeSingle()).data;
      const { error: mergeList } = staff || fast || followups || !labels ? { error: null } : await admin.from("merge_fields").select("enabled").limit(1);
      out.schema = staff
        ? "OUT OF DATE: run migrations from 0006 on (staff sign-in fails until then)"
        : fast
          ? "OUT OF DATE: run migrations 0007 (camps) and 0008 (faster pages)"
          : followups
            ? "OUT OF DATE: run migration 0009 (campers not here yet)"
            : !labels
              ? "OUT OF DATE: run migration 0010 (the 4×6 Publisher labels)"
              : mergeList
                ? "OUT OF DATE: run migrations 0011 to 0014 (labels, mail merge list, security, card buttons)"
                : "applied (0013 security and 0014 can't be checked from here: make sure they ran)";
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
