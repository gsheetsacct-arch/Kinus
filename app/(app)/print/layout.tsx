import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { canPrintCheckin, canUsePrintArea } from "@/lib/auth/permissions";
import { PrintTabs } from "@/components/print/print-tabs";
import { canFixNames } from "@/lib/print/name-columns";
import { canDesign } from "@/lib/print/designers";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [prints, designs] = [canUsePrintArea(user), await canDesign(user)];
  // others request tags from a camper's card; the emailed job link still works for them
  // a check-in login prints its check-in labels (the queue page shows it only those)
  if (!prints && !designs && !canPrintCheckin(user)) redirect("/?denied=print");
  return (
    <div>
      <PrintTabs prints={prints} designs={designs} names={canFixNames(user)} />
      {children}
    </div>
  );
}
