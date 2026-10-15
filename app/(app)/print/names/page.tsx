import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/callout";
import { NameFixer, type NameRow } from "@/components/print/name-fixer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { visibleDivisionIds } from "@/lib/auth/permissions";
import { getCampContext } from "@/lib/data/camp";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { extraValue } from "@/lib/import/extra-fields";
import { fixKey, parseFixes, withFixes } from "@/lib/source-fixes";
import { hasEnglish, isHebrew, NameBook, suggestHebrew } from "@/lib/hebrew-names";
import { canFixNames, canFixNamesFor, hebrewNameColumns } from "@/lib/print/name-columns";
import { byBunkThenName } from "@/lib/print/data";

export const metadata = { title: "Hebrew names" };
export const maxDuration = 60;

export default async function HebrewNamesPage() {
  const [user, session, camp] = await Promise.all([requireUser(), getActiveSession(), getCampContext()]);
  if (!canFixNames(user)) redirect("/print");
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const admin = createAdminClient();
  const columns = await hebrewNameColumns(admin);
  const header = <PageHeader title="Hebrew names" description="Hebrew names typed in English or spelled out (nun shin beis tes), fixed once. New uploads keep the fixes." />;
  if (!columns.length)
    return (
      <div>
        {header}
        <Callout tone="warning">No label field reads a Hebrew name from the export yet. Add one in Fields &amp; conversions (e.g. Hebrew name → the export&apos;s hebrew_name column).</Callout>
      </div>
    );
  const allowed = visibleDivisionIds(user);
  // "*": the staff fixes too (works before migration 0034, without them)
  const campers = await fetchAll((from, to) => {
    let q = admin.from("campers").select("*, divisions(name, color), bunks(name)").eq("session_id", session.id).is("archived_at", null);
    if (camp.divisionIds) q = q.in("division_id", camp.divisionIds);
    if (allowed) q = q.in("division_id", allowed);
    return q.order("id").range(from, to);
  });
  const migrated = campers.length === 0 || "source_fixes" in campers[0];
  const list = campers
    .map((c) => {
      const d = c.divisions as { name: string; color: string | null } | null;
      const b = c.bunks as { name: string } | null;
      return { ...c, division_name: d?.name ?? null, division_color: d?.color ?? null, bunk_name: b?.name ?? null, fixes: parseFixes((c as { source_fixes?: unknown }).source_fixes) };
    })
    .sort(byBunkThenName);
  // what's already in Hebrew teaches the suggestions (siblings' last name, others with the same first name)
  const books = { first: new NameBook(), last: new NameBook() };
  for (const c of list) {
    const row = withFixes(c.source_data, c.fixes);
    for (const col of columns) books[col.kind].learn(col.kind === "first" ? c.first_name : c.last_name, extraValue(row, col.column));
  }
  const rows: NameRow[] = [];
  for (const c of list) {
    for (const col of columns) {
      const registration = extraValue(c.source_data, col.column);
      const fix = c.fixes[fixKey(col.column)] ?? null;
      const now = fix ? fix.value : registration;
      const state = fix ? "fixed" : !now ? "empty" : hasEnglish(now) ? "english" : isHebrew(now) ? null : "english";
      if (!state) continue;
      const english = col.kind === "first" ? c.first_name : c.last_name;
      rows.push({
        camperId: c.id,
        name: `${c.first_name} ${c.last_name}`,
        where: [c.division_name, c.bunk_name].filter(Boolean).join(" · "),
        divisionName: c.division_name,
        divisionColor: c.division_color,
        column: col.column,
        columnLabel: col.label,
        kind: col.kind,
        registration,
        fix: fix ? { value: fix.value, was: fix.was ?? "" } : null,
        state,
        suggestion: state === "fixed" ? null : suggestHebrew(registration, english, books[col.kind]),
        canFix: canFixNamesFor(user, c),
      });
    }
  }
  return (
    <div className="space-y-4">
      {header}
      {!migrated && <Callout tone="warning">Fixes can be saved once the latest database update (migration 0034) has run.</Callout>}
      <NameFixer rows={rows} />
    </div>
  );
}
