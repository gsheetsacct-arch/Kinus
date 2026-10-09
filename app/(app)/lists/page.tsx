import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { visibleDivisionIds } from "@/lib/auth/permissions";
import { buildList, getPresetsFor } from "@/lib/data/lists";
import { PrintButton } from "./print-button";
import { ListGroups } from "@/components/lists/list-groups";
import { getCampContext } from "@/lib/data/camp";

export const metadata = { title: "Lists" };

export default async function ListsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const session = await getActiveSession();
  const sp = await searchParams;
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const supabase = await createClient();
  const [camp, presets, { data: divisions }, { data: bunks }, { data: fv }] = await Promise.all([
    getCampContext(),
    getPresetsFor(supabase, user),
    supabase.from("divisions").select("id, name").eq("session_id", session.id).order("sort_order"),
    supabase.from("bunks").select("id, division_id, name").order("sort_order"),
    supabase.from("field_visibility").select("field_group, roles"),
  ]);
  const allowed = visibleDivisionIds(user);
  const divs = (divisions ?? []).filter((d) => (!allowed || allowed.includes(d.id)) && (!camp.divisionIds || camp.divisionIds.includes(d.id)));
  // someone with exactly one place (e.g. a counselor's bunk) gets it preselected
  const only = !allowed ? null : user.coverage.length === 1 ? user.coverage[0] : null;
  const asked = divs.some((d) => d.id === sp.division) ? sp.division : undefined;
  const divisionId = asked ?? (only && divs.some((d) => d.id === only.division_id) ? only.division_id : undefined) ?? (divs.length === 1 ? divs[0].id : undefined);
  const bunkId = (asked ? sp.bunk : undefined) ?? (only?.division_id === divisionId ? only?.bunk_id : undefined) ?? undefined;
  const preset = presets.find((p) => p.id === sp.preset) ?? presets.find((p) => p.is_default) ?? presets[0];
  const list = preset ? await buildList(supabase, user, preset, { sessionId: session.id, divisionId: divisionId || undefined, bunkId: bunkId || undefined, divisionIds: camp.divisionIds }, fv ?? []) : null;
  const qs = new URLSearchParams({ ...(preset ? { preset: preset.id } : {}), ...(divisionId ? { division: divisionId } : {}), ...(bunkId ? { bunk: bunkId } : {}) }).toString();

  return (
    <div>
      <PageHeader
        title={list ? `${list.preset.name}` : "Lists"}
        description={list ? `${list.scopeLabel} · ${list.groups.reduce((n, g) => n + g.rows.length, 0)} campers` : undefined}
        actions={
          list ? (
            <>
              <PrintButton />
              <Button asChild variant="outline" size="sm">
                <Link href={`/lists/export?${qs}`}>CSV</Link>
              </Button>
            </>
          ) : undefined
        }
      />
      <form method="get" className="no-print mb-6 grid gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] md:grid-cols-[1fr_200px_180px_auto]">
        <Select name="preset" defaultValue={preset?.id ?? ""}>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="division" defaultValue={divisionId ?? ""}>
          <option value="">{camp.current && camp.camps.length > 1 ? `All of ${camp.current.name}` : "All divisions"}</option>
          {divs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select name="bunk" defaultValue={bunkId ?? ""}>
          <option value="">All bunks</option>
          {(bunks ?? [])
            .filter((b) => !divisionId || b.division_id === divisionId)
            .filter((b) => !allowed || user.coverage.some((s) => s.division_id === b.division_id && (s.bunk_id === null || s.bunk_id === b.id)))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </Select>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </form>
      {!preset && <p className="text-sm text-muted-foreground">No list layouts are set up for your role yet. Ask an admin.</p>}
      {list && <ListGroups columns={list.columns} groups={list.groups} />}
    </div>
  );
}
