import { CalendarDays, Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { ActionForm } from "@/components/action-form";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { activateSession, deleteSession, saveSession } from "./actions";

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

const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : null);

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
      description="Divisions, campers and imports start empty in a new session. Staff accounts carry over."
      action={saveSession}
      submitLabel="Create session"
    >
      <SessionFields />
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
