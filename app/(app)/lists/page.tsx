import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { visibleDivisionIds, visibleFieldGroups } from "@/lib/auth/permissions";
import { flagsFor, isFlag } from "@/lib/camper-flags";
import { buildList, getPresetsFor } from "@/lib/data/lists";
import { PrintButton } from "./print-button";
import { ListGroups } from "@/components/lists/list-groups";
import { FILTER_ANY, FILTER_NONE } from "@/lib/data/lists";
import { ListFilters } from "@/components/lists/list-filters";
import { getCampContext } from "@/lib/data/camp";
import { occupiedPlaces } from "@/lib/data/occupied";

export const metadata = { title: "Lists" };

export default async function ListsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.checkinLogin) redirect("/scan");
  const session = await getActiveSession();
  const sp = await searchParams;
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const supabase = await createClient();
  const [camp, presets, { data: divisions }, { data: bunks }, { data: fv }, places] = await Promise.all([
    getCampContext(),
    getPresetsFor(supabase, user),
    supabase.from("divisions").select("id, name").eq("session_id", session.id).order("sort_order"),
    supabase.from("bunks").select("id, division_id, name, divisions!inner(session_id)").eq("divisions.session_id", session.id).order("sort_order"),
    supabase.from("field_visibility").select("field_group, roles"),
    occupiedPlaces(session.id),
  ]);
  const allowed = visibleDivisionIds(user);
  // only divisions and bunks that have campers (an emptied bunk isn't offered)
  const divs = (divisions ?? []).filter((d) => places.divisions.has(d.id) && (!allowed || allowed.includes(d.id)) && (!camp.divisionIds || camp.divisionIds.includes(d.id)));
  // someone with exactly one place (e.g. a counselor's bunk) gets it preselected
  const only = !allowed ? null : user.coverage.length === 1 ? user.coverage[0] : null;
  const asked = divs.some((d) => d.id === sp.division) ? sp.division : undefined;
  const divisionId = asked ?? (only && divs.some((d) => d.id === only.division_id) ? only.division_id : undefined) ?? (divs.length === 1 ? divs[0].id : undefined);
  const bunkId = (asked ? sp.bunk : undefined) ?? (only?.division_id === divisionId ? only?.bunk_id : undefined) ?? undefined;
  // the default list for this person's own role, else the nearest role below theirs
  const ladder = ["director", "division_head", "head_counselor", "counselor"];
  // klolim use the head counselors' lists
  const own = user.role === "owner" ? "director" : user.role === "kloli" ? "head_counselor" : user.role;
  const order = ladder.includes(own) ? ladder.slice(ladder.indexOf(own)) : [own];
  const preset =
    presets.find((p) => p.id === sp.preset) ??
    order.map((a) => presets.find((p) => p.audience === a && p.is_default) ?? presets.find((p) => p.audience === a)).find(Boolean) ??
    presets.find((p) => p.is_default) ??
    presets[0];
  // "only campers with a medical flag" etc., on top of what the layout itself keeps to
  const flags = flagsFor(visibleFieldGroups(user, fv ?? [])).filter((k) => !preset?.only.includes(k));
  const onlyFlag = sp.only && isFlag(sp.only) && flags.includes(sp.only) ? sp.only : undefined;
  // each bunk's counselors and their phones under its title: only when asked for
  const counselors = sp.counselors === "1";
  // the page's column filter (fcol: a column of the list; fval: an answer, has anything, or empty)
  const filter = sp.fcol ? { key: String(sp.fcol).slice(0, 210), value: sp.fval ? String(sp.fval).slice(0, 300) : FILTER_ANY } : undefined;
  const list = preset
    ? await buildList(supabase, user, preset, { sessionId: session.id, divisionId: divisionId || undefined, bunkId: bunkId || undefined, divisionIds: camp.divisionIds, campName: camp.current?.name, only: onlyFlag ? [onlyFlag] : [], counselors, filter }, fv ?? [])
    : null;
  const qs = new URLSearchParams({ ...(preset ? { preset: preset.id } : {}), ...(divisionId ? { division: divisionId } : {}), ...(bunkId ? { bunk: bunkId } : {}), ...(onlyFlag ? { only: onlyFlag } : {}), ...(counselors ? { counselors: "1" } : {}), ...(filter ? { fcol: filter.key, fval: filter.value } : {}) }).toString();

  return (
    <div>
      {/* printed (or saved as a PDF): a cover page first, instead of the page's header */}
      {list && <ListCover list={list} session={session?.name ?? null} camp={camp.current?.name ?? null} by={user.fullName} />}
      <div className="no-print">
      <PageHeader
        title={list ? `${list.preset.name}` : "Lists"}
        description={list ? `${list.scopeLabel} · ${list.groups.reduce((n, g) => n + g.rows.length, 0)} campers` : undefined}
        actions={
          list ? (
            <>
              <PrintButton />
              <Button asChild variant="outline" size="sm">
                <Link href={`/lists/export?${qs}&format=xlsx`} prefetch={false}>
                  <FileSpreadsheet /> Excel
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/lists/export?${qs}`} prefetch={false}>
                  CSV
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />
      </div>
      <ListFilters className="no-print mb-6 grid gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] md:grid-cols-[1fr_200px_180px_180px]">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">List</span>
          <Select name="preset" defaultValue={preset?.id ?? ""}>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Division</span>
          <Select name="division" defaultValue={divisionId ?? ""}>
          <option value="">{camp.current && camp.camps.length > 1 ? `All of ${camp.current.name}` : "All divisions"}</option>
          {divs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Bunk</span>
          <Select name="bunk" defaultValue={bunkId ?? ""}>
          <option value="">All bunks</option>
          {(bunks ?? [])
            .filter((b) => places.bunks.has(b.id) && (!divisionId || b.division_id === divisionId))
            .filter((b) => !allowed || user.coverage.some((s) => s.division_id === b.division_id && (s.bunk_id === null || s.bunk_id === b.id)))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </label>
        {/* filter by the list's own columns (a combined column whole, or a field in it) */}
        <div className="grid gap-2 sm:grid-cols-2 md:col-span-4 md:grid-cols-[1fr_1fr_3fr]">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Filter by</span>
            <Select name="fcol" defaultValue={filter?.key ?? ""}>
              <option value="">Nothing: every camper</option>
              {(list?.filterOptions ?? []).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          {filter && (
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">Is</span>
              <Select name="fval" defaultValue={filter.value}>
                <option value={FILTER_ANY}>Has anything</option>
                <option value={FILTER_NONE}>Empty</option>
                {(list?.filterValues ?? []).map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.value.length > 60 ? `${v.value.slice(0, 60)}…` : v.value} ({v.count})
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
        {preset?.group_by === "bunk" && (
          <label className="flex items-center gap-2 text-sm md:col-span-4">
            <input type="checkbox" name="counselors" value="1" defaultChecked={counselors} className="size-4 accent-[var(--primary)]" />
            Show counselors <span className="text-muted-foreground">(each bunk&apos;s counselors and their phones, under the bunk)</span>
          </label>
        )}
        <noscript>
          <Button type="submit" variant="secondary">
            Show
          </Button>
        </noscript>
      </ListFilters>
      {!preset && <p className="text-sm text-muted-foreground">No list layouts are set up for your role yet. Ask an admin.</p>}
      {/* wide lists (a division head's 20+ columns) print sideways and a little smaller */}
      {list && list.columns.length > 10 && (
        <style>{`@media print { @page { size: landscape; margin: 8mm } .list-table { font-size: ${list.columns.length > 16 ? 6.5 : 8}pt; table-layout: fixed; width: 100% } .list-table th, .list-table td { padding-right: 3px; overflow-wrap: anywhere; } }`}</style>
      )}
      {list && <ListGroups columns={list.columns} groups={list.groups} />}
    </div>
  );
}

/** The printed list's first page: what it is, for whom, how many, and when it was printed. */
function ListCover({ list, session, camp, by }: { list: NonNullable<Awaited<ReturnType<typeof buildList>>>; session: string | null; camp: string | null; by: string }) {
  const campers = list.groups.reduce((n, g) => n + g.rows.length, 0);
  const groups = list.groups.filter((g) => g.title);
  const kind = list.preset.group_by === "bunk" ? "bunks" : list.preset.group_by === "division" ? "divisions" : "groups";
  return (
    <section className="print-only print-cover">
      <div className="print-cover-page flex flex-col text-center">
        <div className="my-auto">
          {(session || camp) && <p className="text-sm uppercase tracking-[0.2em] text-neutral-500">{[session, camp && camp !== session ? `${camp} camp` : null].filter(Boolean).join(" · ")}</p>}
          <h1 className="mt-4 text-5xl font-bold" dir="auto">
            {list.preset.name}
          </h1>
          <p className="mt-4 text-xl" dir="auto">
            {list.scopeLabel}
          </p>
          <p className="mt-6 text-lg">
            {campers} {campers === 1 ? "camper" : "campers"}
            {groups.length > 1 ? ` · ${groups.length} ${kind}` : ""}
          </p>
          {groups.length > 1 && (
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-neutral-600" dir="auto">
              {groups.map((g) => `${g.title} (${g.rows.length})`).join(" · ")}
            </p>
          )}
        </div>
        <p className="pt-10 text-xs text-neutral-500">
          Printed {formatDateTime(new Date().toISOString())} by {by} · Kinus
        </p>
      </div>
    </section>
  );
}
