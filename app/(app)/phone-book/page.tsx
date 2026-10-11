import { redirect } from "next/navigation";
import { BookUser } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { PhoneBook } from "@/components/staff/phone-book";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canUsePhoneBook } from "@/lib/auth/permissions";
import { getCampContext } from "@/lib/data/camp";
import { loadPhoneBook } from "@/lib/data/phone-book";

export const metadata = { title: "Phone book" };

export default async function PhoneBookPage() {
  const [me, session, camp] = await Promise.all([requireUser(), getActiveSession(), getCampContext()]);
  if (!canUsePhoneBook(me)) redirect("/?denied=head-staff");
  if (!session) return <EmptyState icon={BookUser} title="No active session" description="Camp hasn't been set up yet." />;
  const sections = await loadPhoneBook(me, session.id, camp.divisionIds);
  return (
    <div>
      <PageHeader title="Phone book" description="The staff of your divisions. Tap to call, text or email." />
      <PhoneBook sections={sections} />
    </div>
  );
}
