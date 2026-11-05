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
import { buildList, getPresetsFor, parseCopies, printsLandscape } from "@/lib/data/lists";
import { PrintButton } from "./print-button";
import { PdfButton } from "@/components/print/pdf-button";
import { LIST_PAGE_MARGIN } from "@/lib/lists/list-pdf";
import { ListGroups } from "@/components/lists/list-groups";
import { FILTER_ANY, FILTER_NONE } from "@/lib/data/lists";
import { MAX_LIST_FILTERS, filterFieldNames, listFiltersQuery, parseListFilters } from "@/lib/lists/filters";
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
  // the page's column filters (fcol/fval, fcol2/fval2…: a column of the list and an answer, has anything, or empty), all or any
  const { filters, match: filterMatch } = parseListFilters((k) => sp[k]);
  // copies of each group when printed: the layout's own number, or this page's
  const copies = parseCopies(sp.copies ?? preset?.copies);
  const list = preset
    ? await buildList(supabase, user, preset, { sessionId: session.id, divisionId: divisionId || undefined, bunkId: bunkId || undefined, divisionIds: camp.divisionIds, campName: camp.current?.name, only: onlyFlag ? [onlyFlag] : [], counselors, filters, filterMatch }, fv ?? [])
    : null;
  const qs = new URLSearchParams({ ...(preset ? { preset: preset.id } : {}), ...(divisionId ? { division: divisionId } : {}), ...(bunkId ? { bunk: bunkId } : {}), ...(onlyFlag ? { only: onlyFlag } : {}), ...(counselors ? { counselors: "1" } : {}), ...listFiltersQuery(filters, filterMatch) }).toString();
  const groupWord = preset?.group_by === "bunk" ? "bunk" : preset?.group_by === "division" ? "division" : preset?.group_by ? "group" : "list";

  return (
    <div>
      {/* printed (or saved as a PDF): a cover page first, instead of the page's header */}
      {list && <ListCover list={list} session={session?.name ?? null} camp={camp.current?.name ?? null} by={user.fullName} copies={copies} />}
      <div className="no-print">
      <PageHeader
        title={list ? `${list.preset.name}` : "Lists"}
        description={list ? `${list.scopeLabel} · ${list.groups.reduce((n, g) => n + g.rows.length, 0)} campers` : undefined}
        actions={
          list ? (
            <>
              <PdfButton href={`/lists/pdf?${qs}&copies=${copies}`} label={copies > 1 ? `Download PDF (${copies} of each ${groupWord})` : "Download PDF"} size="sm" labelPrinter={false} />
              <PrintButton label={copies > 1 ? `Print (${copies} of each ${groupWord})` : undefined} />
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
        {/* filter by the list's own columns (a combined column whole, or a field in it): several, all or any of them */}
        <div className="space-y-2 md:col-span-4">
          {[...filters, ...(filters.length < MAX_LIST_FILTERS && list?.filterOptions.length ? [null] : [])].map((f, i) => {
            const names = filterFieldNames(i);
            return (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-2 md:grid-cols-[auto_1fr_1fr_2fr]">
                <span className="hidden w-14 pb-2 text-xs font-medium text-muted-foreground md:block">{i === 0 ? "" : filterMatch === "any" ? "or" : "and"}</span>
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">{i === 0 ? "Filter by" : f ? "Also filter by" : filters.length ? "Add a filter" : "Filter by"}</span>
                  <Select name={names.col} defaultValue={f?.key ?? ""}>
                    <option value="">{f ? "No filter (remove)" : i === 0 ? "Nothing: every camper" : "Pick a column…"}</option>
                    {(list?.filterOptions ?? []).map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>
                {f && (
                  <label className="space-y-1">
                    <span className="block text-xs font-medium text-muted-foreground">Is</span>
                    <Select name={names.val} defaultValue={f.value}>
                      <option value={FILTER_ANY}>Has anything</option>
                      <option value={FILTER_NONE}>Empty</option>
                      {(list?.filterValuesBy[f.key] ?? []).map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.value.length > 60 ? `${v.value.slice(0, 60)}…` : v.value} ({v.count})
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
            );
          })}
          {filters.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Show campers who match</span>
              <Select name="fmatch" defaultValue={filterMatch} className="w-auto">
                <option value="all">all of these filters (and)</option>
                <option value="any">any one of them (or)</option>
              </Select>
            </label>
          )}
        </div>
        {preset && (
          <label className="flex items-center gap-2 text-sm md:col-span-4">
            <span className="text-muted-foreground">When printed:</span>
            <Select name="copies" defaultValue={String(copies)} className="w-auto">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? `each ${groupWord} once` : `${n} copies of each ${groupWord}`}
                </option>
              ))}
            </Select>
            {preset.copies && preset.copies > 1 && copies !== preset.copies && <span className="text-xs text-muted-foreground">(the layout says {preset.copies})</span>}
          </label>
        )}
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
      {/* the page as the layout says (upright, sideways, or sideways for wide lists), with a margin all round
          (the browser's own is thin); wide lists (a division head's 20+ columns) a little smaller */}
      {list && <style>{`@media print { @page { size: letter ${printsLandscape(list.preset.orientation, list.columns.length) ? "landscape" : "portrait"}; margin: ${LIST_PAGE_MARGIN} } }`}</style>}
      {list && list.columns.length > 10 && (
        <style>{`@media print { .list-table { font-size: ${list.columns.length > 16 ? 6.5 : 8}pt; table-layout: fixed; width: 100% } .list-table th, .list-table td { padding-right: 3px; overflow-wrap: anywhere; } }`}</style>
      )}
      {list && <ListGroups columns={list.columns} groups={list.groups} copies={copies} />}
    </div>
  );
}

/** The printed list's first page: what it is, for whom, how many, and when it was printed. */
function ListCover({ list, session, camp, by, copies }: { list: NonNullable<Awaited<ReturnType<typeof buildList>>>; session: string | null; camp: string | null; by: string; copies: number }) {
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
            {copies > 1 ? ` · ${copies} copies of each` : ""}
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
