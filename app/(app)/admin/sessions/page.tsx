import { CalendarDays, Copy, Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { ActionForm } from "@/components/action-form";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { activateSession, copySetup, deleteSession, saveSession } from "./actions";

export const metadata = { title: "Sessions" };

function SessionFields({ s }: { s?: { id: string; name: string; starts_on: string | null; ends_on: string | null } }) {
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Name" htmlFor={`name-${s?.id ?? "new"}`} hint="For example the year or the run: “Kinus 5787”.">
        <Input id={`name-${s?.id ?? "new"}`} name="name" defaultValue={s?.name ?? ""} required dir="auto" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First day (optional)" htmlFor={`start-${s?.id ?? "new"}`}>
          <Input id={`start-${s?.id ?? "new"}`} name="starts_on" type="date" defaultValue={s?.starts_on ?? ""} />
        </Field>
        <Field label="Last day (optional)" htmlFor={`end-${s?.id ?? "new"}`}>
          <Input id={`end-${s?.id ?? "new"}`} name="ends_on" type="date" defaultValue={s?.ends_on ?? ""} />
        </Field>
      </div>
    </>
  );
}

/** Which session to start from, and whether staff keep their places. */
function CopyFields({ sessions, required }: { sessions: { id: string; name: string }[]; required?: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <Field label="Start from" htmlFor="copy_from" hint="Camps, divisions and bunks, with their colours, languages and order.">
        <Select id="copy_from" name="copy_from" defaultValue={sessions[0]?.id ?? ""}>
          {sessions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}&apos;s setup
            </option>
          ))}
          {!required && <option value="">Nothing: start empty</option>}
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="copy_staff" defaultChecked className="mt-0.5 size-4" />
        <span>
          Keep staff in the same camps, divisions and bunks
          <span className="block text-xs text-muted-foreground">Change anyone who moved on the Staff page afterwards.</span>
        </span>
      </label>
    </div>
  );
}

// a calendar date ("2026-07-01"), shown as that date whatever time zone the server is in
const fmt = (d: string | null) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

export default async function SessionsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: sessions } = await supabase.from("sessions").select("id, name, starts_on, ends_on, is_active, created_at").order("created_at", { ascending: false });
  const counts = await Promise.all(
    (sessions ?? []).map(async (s) => {
      const [c, i] = await Promise.all([
        supabase.from("campers").select("id", { count: "exact", head: true }).eq("session_id", s.id).is("archived_at", null),
        supabase.from("imports").select("id", { count: "exact", head: true }).eq("session_id", s.id).eq("status", "applied"),
      ]);
      return { id: s.id, campers: c.count ?? 0, imports: i.count ?? 0 };
    }),
  );
  const newButton = (
    <FormDialog
      trigger={
        <Button>
          <Plus /> New session
        </Button>
      }
      title="New session"
      description="Campers start empty: import this year's export into it. Everything else can start from an earlier session."
      action={saveSession}
      submitLabel="Create session"
    >
      <SessionFields />
      {(sessions?.length ?? 0) > 0 && <CopyFields sessions={sessions ?? []} />}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activate" defaultChecked={!sessions?.length} className="size-4" /> Make it the active session now
      </label>
    </FormDialog>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Sessions" description="A session is one run of the program, usually one year." actions={sessions?.length ? newButton : undefined} />
      <Callout>
        Everyone in Kinus works in the <strong>active</strong> session. Campers, divisions, bunks and imports belong to a session. Staff accounts don&apos;t, so you only invite people once.
      </Callout>
      {!sessions?.length && <EmptyState icon={CalendarDays} title="No sessions yet" description="Create the session for this year to get started." action={newButton} />}
      <div className="space-y-4">
        {(sessions ?? []).map((s) => {
          const c = counts.find((x) => x.id === s.id)!;
          const dates = [fmt(s.starts_on), fmt(s.ends_on)].filter(Boolean).join(" – ");
          return (
            <Section
              key={s.id}
              className={s.is_active ? "border-primary/40 ring-1 ring-primary/20" : undefined}
              title={
                <span className="flex flex-wrap items-center gap-2" dir="auto">
                  {s.name}
                  {s.is_active && (
                    <Badge variant="success">
                      <CheckCircle2 className="size-3" /> Active
                    </Badge>
                  )}
                </span>
              }
              description={
                <span>
                  {dates || "No dates set"} · {c.campers} campers · {c.imports} applied {c.imports === 1 ? "import" : "imports"}
                </span>
              }
              actions={
                <>
                  {!s.is_active && (
                    <ActionForm action={activateSession}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button size="sm" type="submit">
                        Make active
                      </Button>
                    </ActionForm>
                  )}
                  {(sessions?.length ?? 0) > 1 && (
                    <FormDialog
                      trigger={
                        <Button size="sm" variant="outline">
                          <Copy /> Copy setup from…
                        </Button>
                      }
                      title={`Copy setup into ${s.name}`}
                      description="Brings in the camps, divisions and bunks of another session, with their colours, languages and order, and keeps staff in the same places. Divisions that are already here (from an import) take on those settings. Campers aren't touched."
                      action={copySetup}
                      submitLabel="Copy setup"
                    >
                      <input type="hidden" name="to" value={s.id} />
                      <CopyFields sessions={(sessions ?? []).filter((x) => x.id !== s.id)} required />
                    </FormDialog>
                  )}
                  <FormDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        <Pencil /> Edit
                      </Button>
                    }
                    title="Edit session"
                    action={saveSession}
                  >
                    <SessionFields s={s} />
                  </FormDialog>
                  <FormDialog
                    trigger={
                      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 /> Delete
                      </Button>
                    }
                    title={`Delete "${s.name}"?`}
                    description={
                      <div className="space-y-2">
                        <p>
                          This permanently deletes its <strong>{c.campers} campers</strong>, all divisions and bunks, every import, and all check-ins. It can&apos;t be
                          undone.
                        </p>
                        <p>Staff accounts stay. Their access to this session&apos;s divisions is removed.</p>
                      </div>
                    }
                    action={deleteSession}
                    submitLabel="Delete forever"
                    destructive
                    confirmText={s.name}
                  >
                    <input type="hidden" name="id" value={s.id} />
                  </FormDialog>
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
