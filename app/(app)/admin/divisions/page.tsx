import Link from "next/link";
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Trash2, Users, Merge, Sparkles, FolderPlus, Folder } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { ActionForm } from "@/components/action-form";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { RadioCards } from "@/components/ui/radio-cards";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { DIVISION_COLORS, LANGUAGES } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { deleteBunk, deleteDivision, deleteGroup, mergeBunk, moveBunk, moveDivision, removeEmpty, saveBunk, saveDivision, saveGroup } from "./actions";

export const metadata = { title: "Divisions & bunks" };

function GroupFields({ g, divisions }: { g?: { id: string; name: string }; divisions: { id: string; name: string; group_id: string | null }[] }) {
  return (
    <>
      {g && <input type="hidden" name="id" value={g.id} />}
      <Field label="Group name" htmlFor="group-name" hint="For example “Main camp”. Give a director this group and they get all its divisions, including ones you add to it later.">
        <Input id="group-name" name="name" defaultValue={g?.name ?? ""} required dir="auto" />
      </Field>
      <Field label="Divisions in this group">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {divisions.map((d) => (
            <label key={d.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm has-[:checked]:border-primary/50 has-[:checked]:bg-primary-soft/40">
              <input type="checkbox" name="division_ids" value={d.id} defaultChecked={g ? d.group_id === g.id : false} className="size-4" />
              <span dir="auto">{d.name}</span>
            </label>
          ))}
        </div>
      </Field>
    </>
  );
}

function DivisionFields({ d, groups }: { d?: { id: string; name: string; language: string; color: string | null; group_id: string | null }; groups: { id: string; name: string }[] }) {
  return (
    <>
      {d && <input type="hidden" name="id" value={d.id} />}
      {groups.length > 0 && (
        <Field label="Group" htmlFor="division-group">
          <Select id="division-group" name="group_id" defaultValue={d?.group_id ?? ""}>
            <option value="">Not in a group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Name" htmlFor="division-name" hint="Use the exact name from the registration export, so future imports match it.">
        <Input id="division-name" name="name" defaultValue={d?.name ?? ""} required dir="auto" />
      </Field>
      <Field label="Language of names">
        <RadioCards
          name="language"
          defaultValue={d?.language ?? "en"}
          columns={3}
          options={[
            { value: "en", label: "English" },
            { value: "he", label: "Hebrew" },
            { value: "fr", label: "French" },
          ]}
        />
      </Field>
      <Field label="Colour" hint="Shown next to the division everywhere, and on name tags later.">
        <div className="flex flex-wrap gap-2">
          {DIVISION_COLORS.map((c) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="color" value={c} defaultChecked={(d?.color ?? DIVISION_COLORS[0]) === c} className="peer sr-only" />
              <span className="block size-8 rounded-full ring-offset-2 ring-offset-card peer-checked:ring-2 peer-checked:ring-foreground" style={{ background: c }} />
            </label>
          ))}
        </div>
      </Field>
    </>
  );
}

function MoveButtons({ action, id, first, last }: { action: (fd: FormData) => Promise<import("@/lib/actions/result").ActionResult>; id: string; first: boolean; last: boolean }) {
  return (
    <span className="flex">
      <ActionForm action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="dir" value="up" />
        <Button type="submit" size="icon" variant="ghost" className="size-8" disabled={first} title="Move up" aria-label="Move up">
          <ArrowUp className="size-4" />
        </Button>
      </ActionForm>
      <ActionForm action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="dir" value="down" />
        <Button type="submit" size="icon" variant="ghost" className="size-8" disabled={last} title="Move down" aria-label="Move down">
          <ArrowDown className="size-4" />
        </Button>
      </ActionForm>
    </span>
  );
}

export default async function DivisionsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requireAdmin();
  const session = await getActiveSession();
  const { d: selectedId } = await searchParams;
  if (!session) {
    return (
      <div className="space-y-6">
        <PageHeader title="Divisions & bunks" />
        <EmptyState icon={Layers} title="No active session" description="Create or activate a session first." action={<Button asChild><Link href="/admin/sessions">Sessions</Link></Button>} />
      </div>
    );
  }
  const supabase = await createClient();
  const [{ data: divisions }, { data: bunks }, campers, { data: groupRows }, { data: groupAreas }] = await Promise.all([
    supabase.from("divisions").select("id, name, language, color, sort_order, group_id").eq("session_id", session.id).order("sort_order").order("name"),
    supabase.from("bunks").select("id, division_id, name, sort_order, divisions!inner(session_id)").eq("divisions.session_id", session.id).order("sort_order").order("name"),
    fetchAll((from, to) => supabase.from("campers").select("division_id, bunk_id").eq("session_id", session.id).is("archived_at", null).order("id").range(from, to)),
    supabase.from("division_groups").select("id, name, sort_order").eq("session_id", session.id).order("sort_order").order("name"),
    supabase.from("staff_scopes").select("group_id").not("group_id", "is", null),
  ]);
  const groups = groupRows ?? [];
  const divs = divisions ?? [];
  const campersIn = (divisionId: string, bunkId?: string | null) =>
    campers.filter((c) => c.division_id === divisionId && (bunkId === undefined || c.bunk_id === bunkId)).length;
  const bunksOf = (divisionId: string) => (bunks ?? []).filter((b) => b.division_id === divisionId);
  const empty = divs.filter((d) => campersIn(d.id) === 0);
  const selected = divs.find((d) => d.id === selectedId) ?? divs[0];

  const addDivision = (
    <FormDialog
      trigger={
        <Button variant="outline" className="w-full">
          <Plus /> Add division
        </Button>
      }
      title="Add a division"
      action={saveDivision}
      submitLabel="Add division"
    >
      <DivisionFields groups={groups} />
    </FormDialog>
  );
  const newGroup = (
    <FormDialog
      trigger={
        <Button variant="ghost" className="w-full">
          <FolderPlus /> New group of divisions
        </Button>
      }
      title="New group"
      description="Group divisions that are run together, so you can give someone access to all of them at once."
      action={saveGroup}
      submitLabel="Create group"
    >
      <GroupFields divisions={divs} />
    </FormDialog>
  );
  const DivisionLink = ({ d }: { d: (typeof divs)[number] }) => {
    const active = d.id === selected?.id;
    return (
      <Link
        href={`/admin/divisions?d=${d.id}`}
        scroll={false}
        className={cn("flex items-center gap-3 border-b px-4 py-3 last:border-0", active ? "bg-primary-soft/70" : "hover:bg-muted/50")}
      >
        <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: d.color ?? "var(--muted-foreground)" }} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", active ? "font-semibold text-primary" : "font-medium")} dir="auto">
            {d.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            {bunksOf(d.id).length} bunks · {campersIn(d.id)} campers
          </span>
        </span>
      </Link>
    );
  };
  const ungrouped = divs.filter((d) => !d.group_id || !groups.some((g) => g.id === d.group_id));

  return (
    <div className="space-y-6">
      <PageHeader title="Divisions & bunks" description="Imports create these for you. Here you can rename, reorder, merge and tidy them." />
      {empty.length > 0 && (
        <Callout
          tone="warning"
          title={`${empty.length} ${empty.length === 1 ? "division has" : "divisions have"} no campers`}
          action={
            <ActionForm action={removeEmpty} confirm="Remove every division and bunk that has no campers and no staff access?">
              <Button size="sm" variant="outline" type="submit">
                <Sparkles /> Remove empty ones
              </Button>
            </ActionForm>
          }
        >
          {empty.map((d) => d.name).join(", ")}. These are often left over from an earlier import.
        </Callout>
      )}
      {!divs.length ? (
        <EmptyState icon={Layers} title="No divisions yet" description="Import the registration export and divisions and bunks are created automatically. Or add one by hand." action={<div className="w-48">{addDivision}</div>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <nav className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
              {groups.map((g) => {
                const members = divs.filter((d) => d.group_id === g.id);
                const people = (groupAreas ?? []).filter((a) => a.group_id === g.id).length;
                return (
                  <div key={g.id}>
                    <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2">
                      <Folder className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir="auto">
                        {g.name}
                      </span>
                      <FormDialog
                        trigger={
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            Edit
                          </Button>
                        }
                        title={`Edit group ${g.name}`}
                        action={saveGroup}
                      >
                        <GroupFields g={g} divisions={divs} />
                      </FormDialog>
                      <FormDialog
                        trigger={
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" aria-label={`Remove group ${g.name}`}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                        title={`Remove the group ${g.name}?`}
                        description={`Its divisions stay as they are.${people ? ` ${people} ${people === 1 ? "person has" : "people have"} access through this group and will lose it.` : ""}`}
                        action={deleteGroup}
                        submitLabel="Remove group"
                        destructive
                      >
                        <input type="hidden" name="id" value={g.id} />
                      </FormDialog>
                    </div>
                    {members.map((d) => (
                      <DivisionLink key={d.id} d={d} />
                    ))}
                    {!members.length && <p className="border-b px-4 py-3 text-xs text-muted-foreground">No divisions yet. Use Edit to add some.</p>}
                  </div>
                );
              })}
              {groups.length > 0 && ungrouped.length > 0 && (
                <div className="border-b bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not in a group</div>
              )}
              {ungrouped.map((d) => (
                <DivisionLink key={d.id} d={d} />
              ))}
            </nav>
            {addDivision}
            {newGroup}
          </div>

          {selected && (
            <Section
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: selected.color ?? "var(--muted-foreground)" }} />
                  <span dir="auto">{selected.name}</span>
                  <Badge variant="secondary">{LANGUAGES[selected.language]}</Badge>
                </span>
              }
              description={`${bunksOf(selected.id).length} bunks · ${campersIn(selected.id)} campers · ${campersIn(selected.id, null)} without a bunk`}
              actions={
                <>
                  <MoveButtons action={moveDivision} id={selected.id} first={divs[0].id === selected.id} last={divs[divs.length - 1].id === selected.id} />
                  <FormDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        <Pencil /> Edit
                      </Button>
                    }
                    title="Edit division"
                    action={saveDivision}
                  >
                    <DivisionFields d={selected} groups={groups} />
                  </FormDialog>
                  {campersIn(selected.id) === 0 && (
                    <FormDialog
                      trigger={
                        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 /> Delete
                        </Button>
                      }
                      title={`Delete ${selected.name}?`}
                      description="It has no campers. Its bunks and any staff access to it are removed too."
                      action={deleteDivision}
                      submitLabel="Delete division"
                      destructive
                    >
                      <input type="hidden" name="id" value={selected.id} />
                    </FormDialog>
                  )}
                </>
              }
              bodyClassName="p-0"
            >
              {bunksOf(selected.id).length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No bunks in this division yet.</p>
              ) : (
                <ul className="divide-y">
                  {bunksOf(selected.id).map((b, i, all) => {
                    const n = campersIn(selected.id, b.id);
                    const others = all.filter((x) => x.id !== b.id);
                    return (
                      <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium" dir="auto">
                            {b.name}
                          </span>
                          <Link href={`/campers?division=${selected.id}&bunk=${b.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                            <Users className="size-3" /> {n} {n === 1 ? "camper" : "campers"}
                          </Link>
                        </span>
                        <span className="flex items-center gap-1">
                          <MoveButtons action={moveBunk} id={b.id} first={i === 0} last={i === all.length - 1} />
                          <FormDialog
                            trigger={
                              <Button size="sm" variant="ghost" title="Rename">
                                <Pencil /> <span className="sr-only sm:not-sr-only">Rename</span>
                              </Button>
                            }
                            title="Rename bunk"
                            description="Tip: if the export spells it differently, the next import will create the bunk again under the export's name."
                            action={saveBunk}
                          >
                            <input type="hidden" name="id" value={b.id} />
                            <input type="hidden" name="division_id" value={selected.id} />
                            <Field label="Bunk name" htmlFor={`bunk-${b.id}`}>
                              <Input id={`bunk-${b.id}`} name="name" defaultValue={b.name} required dir="auto" />
                            </Field>
                          </FormDialog>
                          {others.length > 0 && (
                          <FormDialog
                            trigger={
                              <Button size="sm" variant="ghost" title="Merge into another bunk">
                                <Merge /> <span className="sr-only sm:not-sr-only">Merge</span>
                              </Button>
                            }
                            title={`Merge ${b.name}`}
                            description={`Move its ${n} ${n === 1 ? "camper" : "campers"} into another bunk of ${selected.name}.`}
                            action={mergeBunk}
                            submitLabel="Merge"
                          >
                            <input type="hidden" name="id" value={b.id} />
                            <Field label="Merge into" htmlFor={`into-${b.id}`} hint="All its campers and any staff access move to that bunk, and this bunk is removed.">
                              <Select id={`into-${b.id}`} name="into" defaultValue="" required>
                                <option value="" disabled>
                                  Choose a bunk…
                                </option>
                                {others.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          </FormDialog>
                          )}
                          <FormDialog
                            trigger={
                              <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Delete" aria-label={`Delete ${b.name}`}>
                                <Trash2 />
                              </Button>
                            }
                            title={`Delete ${b.name}?`}
                            description={n ? `Its ${n} campers stay in ${selected.name} without a bunk. To keep them together, use Merge instead.` : "It has no campers."}
                            action={deleteBunk}
                            submitLabel="Delete bunk"
                            destructive
                          >
                            <input type="hidden" name="id" value={b.id} />
                          </FormDialog>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="border-t p-4">
                <FormDialog
                  trigger={
                    <Button variant="tonal" size="sm">
                      <Plus /> Add bunk
                    </Button>
                  }
                  title={`Add a bunk to ${selected.name}`}
                  action={saveBunk}
                  submitLabel="Add bunk"
                >
                  <input type="hidden" name="division_id" value={selected.id} />
                  <Field label="Bunk name" htmlFor="new-bunk">
                    <Input id="new-bunk" name="name" required dir="auto" placeholder="e.g. Bunk Chof" />
                  </Field>
                </FormDialog>
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
