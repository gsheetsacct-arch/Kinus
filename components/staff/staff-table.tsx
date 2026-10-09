"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight, Mail, Search, ShieldCheck, UserX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/form-dialog";
import { cn, initials } from "@/lib/utils";
import { ACCESS_LEVELS, STAFF_ROLES, ROLE_ORDER } from "@/lib/labels";
import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";
import type { AreaTree } from "@/lib/data/areas";
import type { ActionResult } from "@/lib/actions/result";
import { AreaPicker } from "./area-picker";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  level: AccessLevel;
  allAreas: boolean;
  where: string;
  divisionIds: string[];
  groupIds: string[];
  status: { label: string; variant: "success" | "warning" | "destructive" | "outline" };
  active: boolean;
  lastSignIn: string | null;
  manageable: boolean;
};

type Actions = {
  bulkSetAccess: (fd: FormData) => Promise<ActionResult>;
  bulkSendLinks: (fd: FormData) => Promise<ActionResult>;
  bulkSetActive: (fd: FormData) => Promise<ActionResult>;
};

const ROLE_SORT = (r: StaffRole) => ROLE_ORDER.indexOf(r);

export function StaffTable({ rows, tree, roles, actions, lockAll }: { rows: StaffRow[]; tree: AreaTree; roles: StaffRole[]; actions: Actions; lockAll: boolean }) {
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState("");
  const [where, setWhere] = React.useState("");
  const [status, setStatus] = React.useState("active");
  const [sort, setSort] = React.useState("name");
  const [sel, setSel] = React.useState<Set<string>>(new Set());

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (needle && !`${r.name} ${r.email}`.toLowerCase().includes(needle)) return false;
      if (role && r.role !== role) return false;
      if (status === "active" && !r.active) return false;
      if (status === "invited" && !(r.active && r.status.variant === "warning")) return false;
      if (status === "inactive" && r.active) return false;
      if (where === "all" && !r.allAreas) return false;
      if (where.startsWith("g:") && !r.allAreas && !r.groupIds.includes(where.slice(2))) return false;
      if (where.startsWith("d:") && !r.allAreas && !r.divisionIds.includes(where.slice(2))) return false;
      if (where === "none" && (r.allAreas || r.divisionIds.length)) return false;
      return true;
    });
    const by: Record<string, (a: StaffRow, b: StaffRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      role: (a, b) => ROLE_SORT(a.role) - ROLE_SORT(b.role) || a.name.localeCompare(b.name),
      where: (a, b) => a.where.localeCompare(b.where) || a.name.localeCompare(b.name),
      signin: (a, b) => (b.lastSignIn ?? "").localeCompare(a.lastSignIn ?? "") || a.name.localeCompare(b.name),
    };
    return [...list].sort(by[sort]);
  }, [rows, q, role, where, status, sort]);

  const selectable = shown.filter((r) => r.manageable);
  const allChecked = selectable.length > 0 && selectable.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const ids = [...sel].filter((id) => rows.some((r) => r.id === id));
  const Hidden = () => (
    <>
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
    </>
  );
  const clear = () => setSel(new Set());

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] md:grid-cols-[1fr_170px_190px_150px_150px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-9" aria-label="Search staff" />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="">Every role</option>
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {STAFF_ROLES[r].label}
            </option>
          ))}
        </Select>
        <Select value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Where">
          <option value="">Anywhere</option>
          <option value="all">All of camp</option>
          {tree.groups.map((g) => (
            <option key={g.id} value={`g:${g.id}`}>
              {g.name} (camp)
            </option>
          ))}
          {tree.divisions.map((d) => (
            <option key={d.id} value={`d:${d.id}`}>
              {d.name}
            </option>
          ))}
          <option value="none">Not assigned anywhere</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="active">Active</option>
          <option value="invited">Not signed in yet</option>
          <option value="inactive">Deactivated</option>
          <option value="">Everyone</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
          <option value="name">Sort: name</option>
          <option value="role">Sort: role</option>
          <option value="where">Sort: where</option>
          <option value="signin">Sort: last signed in</option>
        </Select>
      </div>

      {ids.length > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft/90 p-3 shadow-sm backdrop-blur md:top-4">
          <span className="mr-auto text-sm font-medium">
            {ids.length} selected{" "}
            <button type="button" className="ml-2 text-xs text-primary underline" onClick={clear}>
              Clear
            </button>
          </span>
          <FormDialog
            wide
            trigger={
              <Button size="sm">
                <ShieldCheck /> Change role or access
              </Button>
            }
            title={`Change ${ids.length} ${ids.length === 1 ? "person" : "people"}`}
            description="Anything left on “Keep” stays as it is for each person."
            action={actions.bulkSetAccess}
            submitLabel="Apply to all selected"
          >
            <Hidden />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" htmlFor="bulk-role">
                <Select id="bulk-role" name="role" defaultValue="">
                  <option value="">Keep their role</option>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {STAFF_ROLES[r].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="What they can do" htmlFor="bulk-level" hint="Changing the role resets this to the role's usual level.">
                <Select id="bulk-level" name="access_level" defaultValue="">
                  <option value="">Keep (or the role&apos;s usual)</option>
                  {(Object.keys(ACCESS_LEVELS) as AccessLevel[]).map((l) => (
                    <option key={l} value={l}>
                      {ACCESS_LEVELS[l].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <BulkWhere tree={tree} lockAll={lockAll} />
          </FormDialog>
          <FormDialog
            trigger={
              <Button size="sm" variant="outline">
                <Mail /> Email sign-in links
              </Button>
            }
            title={`Email ${ids.length} sign-in ${ids.length === 1 ? "link" : "links"}?`}
            description="Each person gets a link that signs them in and lets them choose a password."
            action={actions.bulkSendLinks}
            submitLabel="Send"
          >
            <Hidden />
          </FormDialog>
          <FormDialog
            trigger={
              <Button size="sm" variant="outline" className="text-destructive">
                <UserX /> Deactivate
              </Button>
            }
            title={`Deactivate ${ids.length} ${ids.length === 1 ? "person" : "people"}?`}
            description="They lose access immediately. You can reactivate them later."
            action={actions.bulkSetActive}
            submitLabel="Deactivate"
            destructive
          >
            <Hidden />
            <input type="hidden" name="active" value="false" />
          </FormDialog>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-5">
          <input
            type="checkbox"
            className="size-4"
            checked={allChecked}
            onChange={() => setSel(allChecked ? new Set() : new Set(selectable.map((r) => r.id)))}
            aria-label="Select everyone shown"
            disabled={!selectable.length}
          />
          <span className="flex-1">
            {shown.length} {shown.length === 1 ? "person" : "people"}
          </span>
        </div>
        {shown.map((r) => (
          <div key={r.id} className={cn("flex items-center gap-3 border-b px-4 py-3 last:border-0 sm:px-5", sel.has(r.id) && "bg-primary-soft/40", !r.active && "opacity-60")}>
            <input type="checkbox" className="size-4" checked={sel.has(r.id)} onChange={() => toggle(r.id)} disabled={!r.manageable} aria-label={`Select ${r.name}`} />
            <Link href={`/admin/users/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{initials(r.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium" dir="auto">
                    {r.name}
                  </span>
                  <Badge variant="primary">{STAFF_ROLES[r.role].label}</Badge>
                  {r.status.label !== "Active" && <Badge variant={r.status.variant}>{r.status.label}</Badge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
                <span className={cn("mt-0.5 block truncate text-xs", r.where === "Nowhere yet" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")} dir="auto">
                  {r.where} · {ACCESS_LEVELS[r.level].label}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </div>
        ))}
        {!shown.length && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nobody matches.</p>}
      </div>
    </div>
  );
}

function BulkWhere({ tree, lockAll }: { tree: AreaTree; lockAll: boolean }) {
  const [mode, setMode] = React.useState("keep");
  return (
    <Field label="Where">
      <Select name="where_mode" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Where">
        <option value="keep">Keep where they are</option>
        <option value="replace">Replace with…</option>
        <option value="add">Add…</option>
      </Select>
      {mode !== "keep" && (
        <div className="pt-2">
          <AreaPicker tree={tree} defaultAll={false} defaultAreas={[]} lockAll={lockAll} />
        </div>
      )}
    </Field>
  );
}
