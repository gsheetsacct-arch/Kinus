import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { visibleDivisionIds } from "@/lib/auth/permissions";
import { buildList, getPresetsFor } from "@/lib/data/lists";
import { PrintButton } from "./print-button";

export const metadata = { title: "Lists" };

export default async function ListsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const session = await getActiveSession();
  const sp = await searchParams;
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const supabase = await createClient();
  const [presets, { data: divisions }, { data: bunks }, { data: fv }] = await Promise.all([
    getPresetsFor(supabase, user),
    supabase.from("divisions").select("id, name").eq("session_id", session.id).order("sort_order"),
    supabase.from("bunks").select("id, division_id, name").order("sort_order"),
    supabase.from("field_visibility").select("field_group, global_roles, scope_roles"),
  ]);
  const allowed = visibleDivisionIds(user);
  const divs = (divisions ?? []).filter((d) => !allowed || allowed.includes(d.id));
  // a counselor with exactly one bunk scope gets it preselected
  const onlyScope = user.scopes.length === 1 && !allowed?.length ? null : user.scopes.length === 1 ? user.scopes[0] : null;
  const divisionId = sp.division ?? onlyScope?.division_id ?? (divs.length === 1 ? divs[0].id : undefined);
  const bunkId = sp.bunk ?? onlyScope?.bunk_id ?? undefined;
  const preset = presets.find((p) => p.id === sp.preset) ?? presets.find((p) => p.is_default) ?? presets[0];
  const list = preset ? await buildList(supabase, user, preset, { sessionId: session.id, divisionId: divisionId || undefined, bunkId: bunkId || undefined }, fv ?? []) : null;
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
      <form method="get" className="no-print mb-4 grid gap-2 sm:grid-cols-[1fr_200px_180px_auto]">
        <Select name="preset" defaultValue={preset?.id ?? ""}>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.audience.replace("_", " ")})
            </option>
          ))}
        </Select>
        <Select name="division" defaultValue={divisionId ?? ""}>
          <option value="">All divisions</option>
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
            .filter((b) => !allowed || user.scopes.some((s) => s.division_id === b.division_id && (s.bunk_id === null || s.bunk_id === b.id)))
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
      {!preset && <p className="text-sm text-muted-foreground">No list presets are available for your role yet.</p>}
      {list &&
        list.groups.map((g, gi) => (
          <section key={g.title || "all"} className={gi > 0 ? "print-page-break mt-6" : ""}>
            {g.title && (
              <h2 className="mb-2 text-lg font-semibold" dir="auto">
                {g.title} <span className="text-sm font-normal text-muted-foreground">({g.rows.length})</span>
              </h2>
            )}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-6 py-1 pr-2">#</th>
                  {list.columns.map((c) => (
                    <th key={c.key} className="py-1 pr-3 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.camper.id} className="border-b border-dashed align-top">
                    <td className="py-1 pr-2 text-xs text-muted-foreground">{i + 1}</td>
                    {r.cells.map((v, ci) => (
                      <td key={ci} className="py-1 pr-3" dir="auto">
                        {list.columns[ci].key === "display_name" ? (
                          <Link href={`/campers/${r.camper.id}`} className="print:no-underline hover:underline">
                            {String(v ?? "")}
                          </Link>
                        ) : typeof v === "boolean" ? (
                          v ? "Yes" : "No"
                        ) : list.columns[ci].key.endsWith(".phone") && v ? (
                          <a href={`tel:${v}`} className="underline print:no-underline">
                            {String(v)}
                          </a>
                        ) : (
                          String(v ?? "")
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
    </div>
  );
}
