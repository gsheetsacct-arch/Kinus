import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { FinalCheckout, type CheckoutCamper } from "@/components/checkout/final-checkout";
import { extraValuesFor } from "@/lib/data/extra-fields";
import { hebrewNamesFor } from "@/lib/data/hebrew-display";
import { checkoutState } from "./actions";

import { requireUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { checkoutScope } from "@/lib/attendance/final-checkout";

/** The export's columns for a camper's family (who to call together) and where they're from. */
const FAMILY_COLUMNS = ["UserAttr.family_id", "Family.city", "Family.state", "Family.country"];

export const metadata = { title: "Final check-out" };
export const maxDuration = 60;

/**
 * Final check-out: the end of camp, at one place for all of a camp's divisions. Every scan or
 * tap records "gone home". Check-in logins given final check-out (Staff → Check-in logins)
 * reach every camper of their camp here, and only here.
 */
export default async function CheckoutPage() {
  const user = await requireUser();
  const scope = await checkoutScope(user);
  if (!scope)
    return (
      <EmptyState
        icon={DoorOpen}
        title="Final check-out isn't on for this account"
        description="A director turns it on for a check-in login on the Staff page."
        action={
          <Button asChild>
            <Link href="/scan">Check in</Link>
          </Button>
        }
      />
    );
  // every camper of the camp (read for this page only, after checking the camp is theirs)
  const admin = createAdminClient();
  const ids = scope.divisions.map((d) => d.id);
  const [rows, { data: bunks }] = await Promise.all([
    fetchAll((from, to) =>
      admin
        .from("campers")
        .select("id, camper_code, first_name, last_name, division_id, bunk_id, status, current_buzzer_number")
        .eq("session_id", scope.sessionId)
        .in("division_id", ids)
        .is("archived_at", null)
        .order("id")
        .range(from, to),
    ),
    admin.from("bunks").select("id, name").in("division_id", ids),
  ]);
  const div = new Map(scope.divisions.map((d) => [d.id, d.name]));
  const bunk = new Map((bunks ?? []).map((b) => [b.id, b.name]));
  // each camper's family (the export's family id) and where they're from, and Hebrew names
  // (Hebrew and French divisions), to tell campers apart and call a family together
  const [extra, hebrew, state] = await Promise.all([
    extraValuesFor(rows.map((c) => c.id), FAMILY_COLUMNS.map((column) => ({ column }))).catch(() => new Map<string, Record<string, string>>()),
    hebrewNamesFor(rows.map((c) => ({ id: c.id, division_id: c.division_id }))).catch(() => new Map<string, string>()),
    checkoutState(),
  ]);
  const roster: CheckoutCamper[] = rows.map((c) => {
    const x = extra.get(c.id) ?? {};
    const from = [x["Family.city"], x["Family.country"] && !/^(usa|us|united states)$/i.test(x["Family.country"].trim()) ? x["Family.country"] : x["Family.state"]].map((v) => (v ?? "").trim()).filter(Boolean).join(", ");
    return {
      id: c.id,
      code: c.camper_code,
      name: `${c.first_name} ${c.last_name}`,
      first: c.first_name,
      last: c.last_name,
      where: [div.get(c.division_id!) ?? "", (c.bunk_id && bunk.get(c.bunk_id)) || "no bunk"].join(" · "),
      status: c.status,
      div: c.division_id,
      buzzer: c.current_buzzer_number,
      ...(hebrew.has(c.id) ? { heb: hebrew.get(c.id) } : {}),
      family: (x["UserAttr.family_id"] ?? "").trim() || null,
      from,
    };
  });
  return <FinalCheckout roster={roster} campName={scope.campName} divisions={scope.divisions} initialCalls={state.calls} />;
}
