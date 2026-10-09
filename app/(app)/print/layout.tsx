import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { canUsePrintArea, isAdmin } from "@/lib/auth/permissions";
import { PrintTabs } from "@/components/print/print-tabs";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // others request tags from a camper's card; the emailed job link still works for them
  if (!canUsePrintArea(user)) redirect("/?denied=print");
  return (
    <div>
      <PrintTabs admin={isAdmin(user)} />
      {children}
    </div>
  );
}
