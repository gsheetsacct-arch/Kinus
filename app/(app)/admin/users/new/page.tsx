import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { PersonForm } from "@/components/staff/person-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireDirector } from "@/lib/auth/current-user";
import { canManageRole, isAdmin } from "@/lib/auth/permissions";
import { ROLE_ORDER } from "@/lib/labels";
import { grantableTree, loadAreaTree } from "@/lib/data/areas";
import { savePerson } from "../actions";

export const metadata = { title: "Add a person" };

export default async function NewPersonPage() {
  const me = await requireDirector();
  const session = await getActiveSession();
  const tree = await loadAreaTree(createAdminClient(), session?.id);
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader back={{ href: "/admin/users", label: "Staff" }} title="Add a person" description="Everything about them on one page. Adding many? Use “Add many at once” instead." />
      <Section>
        <PersonForm
          isNew
          person={{ full_name: "", email: "", phone: "", role: "counselor", access_level: "scan", all_areas: false, areas: [] }}
          roles={ROLE_ORDER.filter((r) => canManageRole(me, r))}
          tree={grantableTree(me, tree)}
          action={savePerson}
          submitLabel="Add person"
          lockAll={!isAdmin(me)}
        />
      </Section>
    </div>
  );
}
