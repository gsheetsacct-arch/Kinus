import Link from "next/link";
import { notFound } from "next/navigation";
import { Merge } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireStaffManager } from "@/lib/auth/current-user";
import { canManageRole } from "@/lib/auth/permissions";
import { STAFF_ROLES, areaLabel } from "@/lib/labels";
import { areaNames, loadAreaTree } from "@/lib/data/areas";
import { signInInfo, statusOf } from "@/lib/data/staff";
import { shownEmail } from "@/lib/staff/login-kinds";
import { formatPhone } from "@/lib/utils";
import { mergePeople } from "../actions";

export const metadata = { title: "Merge staff" };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Two records of one person (added by hand with a sign-in, then again by the staff
 * import): pick the one to keep (the one that signs in, usually) and which phone, and
 * the other's areas, registration details and history move over; the other is deleted.
 */
export default async function MergePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const me = await requireStaffManager();
  const sp = await searchParams;
  if (!sp.a || !UUID.test(sp.a)) notFound();
  const session = await getActiveSession();
  const admin = createAdminClient();
  const [{ data: everyone }, tree, info] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, phone, title, role, is_active, login, source_id").order("full_name"),
    loadAreaTree(admin, session?.id),
    signInInfo(),
  ]);
  const names = areaNames(tree);
  const a = (everyone ?? []).find((p) => p.id === sp.a);
  if (!a) notFound();
  const b = sp.b && UUID.test(sp.b) ? (everyone ?? []).find((p) => p.id === sp.b && p.id !== a.id) : undefined;
  const ids = [a.id, ...(b ? [b.id] : [])];
  const { data: areas } = await admin.from("staff_scopes").select("user_id, group_id, division_id, bunk_id").in("user_id", ids);
  const whereOf = (id: string) => (areas ?? []).filter((x) => x.user_id === id).map((x) => areaLabel(x, names)).join(", ") || "Nowhere yet";
  const others = (everyone ?? []).filter((p) => p.id !== a.id && p.login !== "shared" && canManageRole(me, p.role));

  // pick the other record first
  if (!b)
    return (
      <div className="max-w-2xl space-y-4">
        <PageHeader title={`Merge ${a.full_name}`} description="Choose the other record of the same person. Same-name records are listed first." />
        <form action="/admin/users/merge" className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
          <input type="hidden" name="a" value={a.id} />
          <Select name="b" required className="min-w-0 flex-1 basis-64" defaultValue="">
            <option value="" disabled>
              The other record…
            </option>
            {[...others.filter((p) => same(p.full_name, a.full_name)), ...others.filter((p) => !same(p.full_name, a.full_name))].map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} · {STAFF_ROLES[p.role].label}
                {p.phone ? ` · ${formatPhone(p.phone)}` : ""}
                {p.login === "none" ? " · listed only" : ""}
              </option>
            ))}
          </Select>
          <Button type="submit">Next</Button>
        </form>
      </div>
    );

  // the one that signs in is kept by default; the import's phone is offered first
  const signsIn = (p: typeof a) => p.login !== "none";
  const keepDefault = signsIn(a) || !signsIn(b) ? a : b;
  const phones = [...new Set([b.phone, a.phone].filter((x): x is string => Boolean(x && x.trim())))];
  const phoneDefault = (keepDefault.id === a.id ? b : a).phone || keepDefault.phone || "";
  const card = (p: typeof a) => (
    <label key={p.id} className="group block cursor-pointer">
      <input type="radio" name="keep" value={p.id} defaultChecked={p.id === keepDefault.id} className="peer sr-only" />
      <div className="h-full space-y-1.5 rounded-xl border-2 bg-card p-4 text-sm peer-checked:border-primary peer-checked:bg-primary-soft/40">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold" dir="auto">
            {p.full_name}
          </span>
          <Badge variant={statusOf(p.is_active, info.get(p.id), p.login).variant}>{statusOf(p.is_active, info.get(p.id), p.login).label}</Badge>
        </div>
        <p className="text-muted-foreground">{shownEmail(p.email) ?? "No email"}</p>
        <p>
          {STAFF_ROLES[p.role].label}
          {p.title ? ` · ${p.title}` : ""}
        </p>
        <p>{whereOf(p.id)}</p>
        <p>{p.phone ? formatPhone(p.phone) : <span className="text-muted-foreground">No phone</span>}</p>
        {p.source_id && <p className="text-xs text-muted-foreground">From the staff import (registration {p.source_id})</p>}
        <p className="pt-1 text-xs font-medium text-primary opacity-0 group-has-[:checked]:opacity-100">Kept</p>
      </div>
    </label>
  );
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Merge two records"
        description="Choose the one to keep (usually the one that signs in). It gets the other's divisions and bunks, registration details and history, and the phone you choose; the other record is deleted."
      />
      <ActionForm
        action={mergePeople}
        confirm="Merge these two records?"
        confirmDetail="The record not kept is deleted (with its sign-in, if it has one). This can't be undone."
        confirmLabel="Merge"
        className="space-y-4"
      >
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Keep</legend>
          {card(a)}
          {card(b)}
        </fieldset>
        {/* the other one is the one dropped: the form says which by what isn't kept */}
        <MergeDrop a={a.id} b={b.id} />
        {phones.length > 1 ? (
          <fieldset className="space-y-2 rounded-xl border bg-card p-4">
            <legend className="px-1 text-sm font-medium">Phone</legend>
            {phones.map((ph) => (
              <label key={ph} className="flex items-center gap-2 text-sm">
                <input type="radio" name="phone" value={ph} defaultChecked={ph === phoneDefault} className="size-4 accent-[var(--primary)]" />
                {formatPhone(ph)}
                {ph === b.phone && b.source_id ? <span className="text-xs text-muted-foreground">(from the import)</span> : ph === a.phone && a.source_id ? <span className="text-xs text-muted-foreground">(from the import)</span> : null}
              </label>
            ))}
          </fieldset>
        ) : (
          <input type="hidden" name="phone" value={phones[0] ?? ""} />
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">
            <Merge /> Merge
          </Button>
          <Button variant="ghost" asChild>
            <Link href={`/admin/users/merge?a=${a.id}`}>Pick another record</Link>
          </Button>
        </div>
      </ActionForm>
    </div>
  );
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z֐-׿]+/g, " ").trim();
const same = (x: string, y: string) => norm(x) === norm(y);

/** Both ids go along; the action drops whichever isn't the one kept. */
function MergeDrop({ a, b }: { a: string; b: string }) {
  return <input type="hidden" name="pair" value={`${a},${b}`} />;
}
