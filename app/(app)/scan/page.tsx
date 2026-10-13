import Link from "next/link";
import { ScanLine } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Scanner, type RosterEntry } from "@/components/scan/scanner";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { LEVEL_RANK, effectiveLevel } from "@/lib/auth/permissions";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { loadAreaTree } from "@/lib/data/areas";
import { getCampContext } from "@/lib/data/camp";
import { loadCardTemplates } from "@/lib/print/card-templates";

export const metadata = { title: "Check in" };
export const maxDuration = 60;

export default async function ScanPage() {
  const user = await requireUser();
  const session = await getActiveSession();
  if (!session) return <EmptyState icon={ScanLine} title="No active session" description="Camp hasn't been set up yet." action={<Button asChild><Link href="/">Home</Link></Button>} />;
  const supabase = await createClient();
  const [rows, tree, { data: templates }] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from("campers").select("id, camper_code, first_name, last_name, division_id, bunk_id, status").eq("session_id", session.id).is("archived_at", null).order("id").range(from, to),
    ),
    loadAreaTree(supabase, session.id),
    loadCardTemplates(supabase).then((data) => ({ data })),
  ]);
  const div = new Map(tree.divisions.map((d) => [d.id, d]));
  const roster: RosterEntry[] = rows.map((c) => {
    const d = c.division_id ? div.get(c.division_id) : undefined;
    const b = d?.bunks.find((x) => x.id === c.bunk_id);
    return { id: c.id, code: c.camper_code, name: `${c.first_name} ${c.last_name}`, first: c.first_name, last: c.last_name, where: [d?.name, b?.name ?? "no bunk"].filter(Boolean).join(" · "), status: c.status, div: c.division_id };
  });
  // the divisions this person checks in (more than one: they pick which line they're at)
  // (only the camp chosen at the top of the menu: American, Hebrew…)
  const camp = await getCampContext();
  const present = new Set(rows.map((c) => c.division_id));
  const divisions = tree.divisions.filter((d) => present.has(d.id) && (!camp.divisionIds || camp.divisionIds.includes(d.id))).map((d) => ({ id: d.id, name: d.name, color: d.color }));
  return <Scanner roster={roster} templates={templates ?? []} canScan={LEVEL_RANK[effectiveLevel(user)] >= LEVEL_RANK.scan} divisions={divisions} />;
}
