import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StaffTags } from "@/components/print/staff-tags";
import { Button } from "@/components/ui/button";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { canDesign } from "@/lib/print/designers";
import { staffInView } from "@/lib/print/staff";
import { forCampers } from "@/lib/print/staff-values";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserRound } from "lucide-react";

export const metadata = { title: "Staff tags" };

/** Name tags and badges for staff: pick a staff template and who, and print. */
export default async function StaffTagsPage() {
  const user = await requireUser();
  if (!canUsePrintArea(user)) redirect("/print/templates");
  const admin = createAdminClient();
  const session = await getActiveSession();
  const [{ data: rows }, people, tree, designs] = await Promise.all([
    admin.from("print_templates").select("*").not("name", "like", "(retired)%").order("sort_order").order("name"),
    staffInView(user),
    loadAreaTree(admin, session?.id),
    canDesign(user),
  ]);
  const templates = (rows ?? []).filter((t) => !forCampers(t)).map((t) => ({ id: t.id, name: t.name, copies: Number((t as { copies?: number }).copies) || 1, sheet: Boolean(t.sheet_layout) }));
  const shown = new Set(people.flatMap((p) => p.divisionIds));
  return (
    <div>
      <PageHeader title="Staff tags" description="Name tags and badges for staff, filled from the staff list: name, position, division, bunk, phone and what registration sent." />
      {!templates.length ? (
        <EmptyState
          icon={UserRound}
          title="No staff templates yet"
          description={
            designs
              ? "Make one under Templates: New staff template, or turn a camper design into a staff one with its “For staff” button."
              : "Ask a director to make a staff template (Print → Templates → New staff template)."
          }
          action={
            designs ? (
              <Button asChild>
                <Link href="/print/templates/new?for=staff">New staff template</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <StaffTags
          templates={templates}
          people={people.map(({ id, name, role, title, divisionIds }) => ({ id, name, role, title, divisionIds }))}
          divisions={tree.divisions.filter((d) => shown.has(d.id)).map(({ id, name, color }) => ({ id, name, color }))}
        />
      )}
    </div>
  );
}
