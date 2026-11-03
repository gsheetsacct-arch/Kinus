import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth/current-user";
import { SupplementForm } from "@/components/import/supplement-form";

export const metadata = { title: "Add info to campers" };

/** A short file of extra details for some campers, by registration ID (no names, nobody added). */
export default async function SupplementPage() {
  await requireAdmin();
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        back={{ href: "/admin/imports", label: "Import roster" }}
        title="Add info to campers"
        description="A file with extra details for some campers: their registration ID and a few columns (a bus, a room, an allergy update…). Only those columns are added, to those campers; nobody is added, moved or marked missing, and the next full export keeps them."
      />
      <SupplementForm />
    </div>
  );
}
