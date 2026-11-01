import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StaffTags } from "@/components/print/staff-tags";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/current-user";
import { canUsePrintArea } from "@/lib/auth/permissions";
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
  const [{ data: rows }, people, designs] = await Promise.all([
    admin.from("print_templates").select("*").not("name", "like", "(retired)%").order("sort_order").order("name"),
    staffInView(user),
    canDesign(user),
  ]);
  const templates = (rows ?? []).filter((t) => !forCampers(t)).map((t) => ({ id: t.id, name: t.name, copies: Number((t as { copies?: number }).copies) || 1, sheet: Boolean(t.sheet_layout) }));
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
          // the division each name tag says (the office's staff sheet: teams like Ohel Rally too)
          people={people.map(({ id, name, role, title, values }) => ({ id, name, role, title, label: values.DIVISION ?? "" }))}
        />
      )}
    </div>
  );
}
