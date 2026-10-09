import { PageHeader } from "@/components/page-header";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireDirector } from "@/lib/auth/current-user";
import { canManageRole } from "@/lib/auth/permissions";
import { ROLE_ORDER } from "@/lib/labels";
import { loadAreaTree } from "@/lib/data/areas";
import { applyBulkAdd, previewBulkAdd } from "../actions";
import { BulkAdd } from "./bulk-add";

export const metadata = { title: "Add many staff" };

export default async function BulkAddPage() {
  const me = await requireDirector();
  const session = await getActiveSession();
  const tree = await loadAreaTree(createAdminClient(), session?.id);
  const d = tree.divisions[0];
  const example = [
    "Name\tEmail\tRole\tDivision\tBunk",
    `Levi Cohen\tlevi@example.com\tCounselor\t${d?.name ?? "Division 2"}\t${d?.bunks[0]?.name ?? "Bunk Chof"}`,
    `Shmuli Levin\tshmuli@example.com\tHead counselor\t${d?.name ?? "Division 2"}\t`,
    `Rivky Katz\trivky@example.com\tDirector\t${tree.groups[0]?.name ?? "American"}\t`,
    "Office desk\toffice@example.com\tOffice\tAll\t",
  ].join("\n");
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader back={{ href: "/admin/users", label: "Staff" }} title="Add many staff at once" description="Paste your staff list, check it, and everyone is set up in one go." />
      <BulkAdd roles={ROLE_ORDER.filter((r) => canManageRole(me, r))} preview={previewBulkAdd} apply={applyBulkAdd} example={example} />
    </div>
  );
}
