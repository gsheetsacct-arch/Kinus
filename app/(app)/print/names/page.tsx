import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/callout";
import { NameFixer, type NameRow } from "@/components/print/name-fixer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { getCampContext } from "@/lib/data/camp";
import { canFixNames, hebrewNameColumns } from "@/lib/print/name-columns";
import { hebrewNameReview } from "@/lib/hebrew-name-review";

export const metadata = { title: "Hebrew names" };
export const maxDuration = 60;

export default async function HebrewNamesPage() {
  const [user, session, camp] = await Promise.all([requireUser(), getActiveSession(), getCampContext()]);
  if (!canFixNames(user)) redirect("/print");
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const admin = createAdminClient();
  const named = await hebrewNameColumns(admin);
  const header = <PageHeader title="Hebrew names" description="Hebrew names typed in English or spelled out (nun shin beis tes), fixed once. New uploads keep the fixes." />;
  if (!named.length)
    return (
      <div>
        {header}
        <Callout tone="warning">No label field reads a Hebrew name from the export yet. Add one in Fields &amp; conversions (e.g. Hebrew name → the export&apos;s hebrew_name column).</Callout>
      </div>
    );
  const { rows, migrated } = await hebrewNameReview(user, session.id, { divisionIds: camp.divisionIds, db: admin });
  return (
    <div className="space-y-4">
      {header}
      {!migrated && <Callout tone="warning">Fixes can be saved once the latest database update (migration 0034) has run.</Callout>}
      <NameFixer rows={rows.filter((r): r is NameRow => r.state !== null)} />
    </div>
  );
}
