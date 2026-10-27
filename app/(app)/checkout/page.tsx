import Link from "next/link";
import { DoorOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Scanner, type RosterEntry } from "@/components/scan/scanner";
import { requireUser } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { checkoutScope } from "@/lib/attendance/final-checkout";

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
  const roster: RosterEntry[] = rows.map((c) => ({
    id: c.id,
    code: c.camper_code,
    name: `${c.first_name} ${c.last_name}`,
    first: c.first_name,
    last: c.last_name,
    where: [div.get(c.division_id!) ?? "", (c.bunk_id && bunk.get(c.bunk_id)) || "no bunk"].join(" · "),
    status: c.status,
    div: c.division_id,
    buzzer: c.current_buzzer_number,
  }));
  return <Scanner roster={roster} templates={[]} canScan final={{ campName: scope.campName, divisions: scope.divisions }} />;
}
