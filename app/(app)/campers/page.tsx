import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { isAdmin, visibleDivisionIds } from "@/lib/auth/permissions";
import { listCampers } from "@/lib/data/campers";

export const metadata = { title: "Campers" };

export default async function CampersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const session = await getActiveSession();
  const sp = await searchParams;
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const supabase = await createClient();
  const [{ data: divisions }, { data: bunks }] = await Promise.all([
    supabase.from("divisions").select("id, name, color").eq("session_id", session.id).order("sort_order"),
    supabase.from("bunks").select("id, division_id, name").order("sort_order"),
  ]);
  const allowed = visibleDivisionIds(user);
  const divs = (divisions ?? []).filter((d) => !allowed || allowed.includes(d.id));
  const campers = await listCampers(supabase, { sessionId: session.id, divisionId: sp.division, bunkId: sp.bunk, status: sp.status, q: sp.q, includeArchived: sp.archived === "1" });

  return (
    <div>
      <PageHeader
        title="Campers"
        description={`${campers.length} shown`}
        actions={
          isAdmin(user) ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/campers/new">Add walk-in</Link>
            </Button>
          ) : undefined
        }
      />
      <form className="no-print mb-4 grid gap-2 rounded-xl border bg-card p-3 shadow-[var(--shadow-card)] sm:grid-cols-[1fr_180px_160px_140px_auto]" method="get">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name (any language), code, or phone" dir="auto" autoFocus />
        <Select name="division" defaultValue={sp.division ?? ""}>
          <option value="">All divisions</option>
          {divs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select name="bunk" defaultValue={sp.bunk ?? ""}>
          <option value="">All bunks</option>
          {(bunks ?? [])
            .filter((b) => !sp.division || b.division_id === sp.division)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""}>
          <option value="">Any status</option>
          <option value="expected">Expected</option>
          <option value="present">Present</option>
          <option value="out">Out</option>
          <option value="departed">Departed</option>
          <option value="no_show">No-show</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <div className="space-y-2 md:hidden">
        {campers.map((c) => (
          <Link key={c.id} href={`/campers/${c.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" dir="auto">
                {c.display_name}
              </div>
              <div className="truncate text-xs text-muted-foreground" dir="auto">
                {[c.division_name, c.bunk_name ?? "unassigned", c.grade ? `Grade ${c.grade}` : null].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.has_medical_flag && <Badge variant="warning">medical</Badge>}
                {c.in_latest_import === false && <Badge variant="outline">not in export</Badge>}
                {c.archived_at && <Badge variant="secondary">archived</Badge>}
              </div>
            </div>
            <StatusBadge status={c.status!} />
          </Link>
        ))}
        {!campers.length && <p className="py-8 text-center text-sm text-muted-foreground">No campers match.</p>}
      </div>
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Division</TableHead>
            <TableHead>Bunk</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {campers.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/campers/${c.id}`} className="font-medium hover:underline" dir="auto">
                  {c.display_name}
                </Link>
                {c.archived_at && <Badge variant="secondary" className="ml-2">archived</Badge>}
              </TableCell>
              <TableCell className="font-mono text-xs">{c.camper_code}</TableCell>
              <TableCell dir="auto">{c.division_name ?? "—"}</TableCell>
              <TableCell dir="auto">{c.bunk_name ?? <span className="text-muted-foreground">unassigned</span>}</TableCell>
              <TableCell>{c.grade ?? ""}</TableCell>
              <TableCell>
                <StatusBadge status={c.status!} />
              </TableCell>
              <TableCell className="space-x-1 text-right">
                {c.has_medical_flag && <Badge variant="warning">medical</Badge>}
                {c.in_latest_import === false && <Badge variant="outline">not in latest export</Badge>}
              </TableCell>
            </TableRow>
          ))}
          {!campers.length && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                No campers match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
