import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Mail } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { canAccessBunk, isAdmin, visibleFieldGroups } from "@/lib/auth/permissions";
import { getCamper } from "@/lib/data/campers";
import { formatDateTime } from "@/lib/utils";
import { addContact, archiveCamper, removeContact, updateCamper } from "../actions";

const ROLE_LABEL: Record<string, string> = { mother: "Mother", father: "Father", guardian: "Guardian", emergency: "Emergency", host: "Host", authorized_pickup: "Authorized pickup" };

function Field({ label, value, dir }: { label: string; value: React.ReactNode; dir?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div dir={dir ?? "auto"} className="text-sm">
        {value ?? <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}
const yn = (b: boolean | null | undefined) => (b === null || b === undefined ? null : b ? "Yes" : "No");

export default async function CamperPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const c = await getCamper(supabase, id);
  if (!c) notFound();
  const [{ data: fv }, { data: events }, { data: history }, { data: bunks }] = await Promise.all([
    supabase.from("field_visibility").select("field_group, roles"),
    supabase.from("attendance_events").select("id, event_type, method, occurred_at, note, resulting_status, profiles:recorded_by(full_name)").eq("camper_id", id).order("occurred_at", { ascending: false }).limit(100),
    supabase.rpc("camper_history", { p_camper_id: id }),
    supabase.from("divisions").select("id, name, bunks(id, name, sort_order)").eq("session_id", c.session_id!).order("sort_order"),
  ]);
  const placeable = (bunks ?? [])
    .filter((d) => canAccessBunk(user, d.id, null, "edit") || d.id === c.division_id)
    .map((d) => ({ ...d, bunks: [...(d.bunks as { id: string; name: string; sort_order: number }[])].sort((a, b) => a.sort_order - b.sort_order) }));
  const groups = visibleFieldGroups(user, fv ?? []);
  const canEdit = c.division_id ? canAccessBunk(user, c.division_id, c.bunk_id, "edit") : isAdmin(user);
  const canEditSensitive = canEdit && groups.has("medical") && groups.has("address") && groups.has("parent_notes");

  return (
    <div>
      <PageHeader
        back={{ href: "/campers", label: "Campers" }}
        title={c.display_name ?? ""}
        description={[c.division_name, c.bunk_name ?? "unassigned", c.grade ? `Grade ${c.grade}` : null].filter(Boolean).join(" · ")}
        actions={
          <>
            <span className="font-mono text-sm text-muted-foreground">{c.camper_code}</span>
            {isAdmin(user) && (
              <ActionForm action={archiveCamper} confirm={c.archived_at ? undefined : "Archive this camper?"}>
                <input type="hidden" name="id" value={c.id!} />
                {c.archived_at && <input type="hidden" name="restore" value="1" />}
                <Button variant="ghost" size="sm" type="submit">
                  {c.archived_at ? "Restore" : "Archive"}
                </Button>
              </ActionForm>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status!} className="text-base" />
        {c.has_medical_flag && <Badge variant="warning">medical flag</Badge>}
        {c.in_latest_import === false && <Badge variant="outline">not in latest export</Badge>}
        {c.archived_at && <Badge variant="secondary">archived</Badge>}
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({events?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          {canEdit && <TabsTrigger value="edit">Edit</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Field label="Division" value={c.division_name} />
              <Field label="Bunk" value={c.bunk_name} />
              <Field label="Grade" value={c.grade} />
              <Field label="T-shirt" value={c.tshirt_size} />
              <Field label="Bunk preferences" value={(c.bunk_preferences ?? []).join(", ") || null} />
              <Field label="Registration ID" value={c.source_id} />
              {groups.has("address") && <Field label="Local address" value={c.local_address} />}
              {groups.has("address") && <Field label="Cross streets" value={c.local_address_cross_streets} />}
              {groups.has("staff_notes") && <Field label="Staff notes" value={c.staff_notes} />}
            </CardContent>
          </Card>
          <Card className={groups.has("medical") ? "border-amber-400/60" : undefined}>
            <CardHeader>
              <CardTitle>Medical</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {groups.has("medical") ? (
                <>
                  <Field label="Allergies?" value={yn(c.has_allergies)} />
                  <Field label="EpiPen" value={yn(c.has_epipen)} />
                  <Field label="Medications" value={yn(c.has_medications)} />
                  <Field label="Allergies" value={c.allergies} />
                  <div className="col-span-2">
                    <Field label="Medical notes" value={c.medical_notes} />
                  </div>
                </>
              ) : (
                <p className="col-span-2 text-sm text-muted-foreground">{c.has_medical_flag ? "Medical flag set — ask the head counselor for details." : "No medical flag."}</p>
              )}
              {groups.has("parent_notes") && (
                <div className="col-span-2">
                  <Field label="Notes from parents" value={c.notes_from_parents} />
                </div>
              )}
            </CardContent>
          </Card>
          {groups.has("contacts") && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Contacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {c.contacts.map((k) => (
                  <div key={`${k.role}${k.slot}`} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <span className="w-28 text-xs text-muted-foreground">
                      {ROLE_LABEL[k.role]}
                      {k.role === "emergency" ? ` ${k.slot}` : ""}
                    </span>
                    <span dir="auto" className="font-medium">
                      {k.name ?? "—"}
                    </span>
                    {(k.phone_e164 ?? k.phone) && (
                      <a href={`tel:${k.phone_e164 ?? k.phone}`} className="inline-flex items-center gap-1 underline">
                        <Phone className="size-3.5" /> {k.phone}
                      </a>
                    )}
                    {k.email && (
                      <a href={`mailto:${k.email}`} className="inline-flex items-center gap-1 underline">
                        <Mail className="size-3.5" /> {k.email}
                      </a>
                    )}
                    {(k as { source?: string }).source === "manual" && canEdit && (
                      <ActionForm action={removeContact} className="ml-auto">
                        <input type="hidden" name="id" value={(k as { id?: string }).id ?? ""} />
                        <input type="hidden" name="camper_id" value={c.id!} />
                        <Button size="sm" variant="ghost" className="text-destructive" type="submit">
                          Remove
                        </Button>
                      </ActionForm>
                    )}
                  </div>
                ))}
                {!c.contacts.length && <p className="text-sm text-muted-foreground">No contacts on file.</p>}
                {canEdit && (
                  <ActionForm action={addContact} className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[160px_1fr_1fr_1fr_auto]" resetOnSuccess>
                    <input type="hidden" name="camper_id" value={c.id!} />
                    <Select name="role" defaultValue="authorized_pickup" className="h-9">
                      {Object.entries(ROLE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                    <Input name="name" placeholder="Name" dir="auto" className="h-9" />
                    <Input name="phone" placeholder="Phone" className="h-9" />
                    <Input name="email" placeholder="Email" type="email" className="h-9" />
                    <Button size="sm" variant="secondary" type="submit">
                      Add contact
                    </Button>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="timeline">
          {events?.length ? (
            <ul className="space-y-1 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-2 rounded-md border px-3 py-2">
                  <span className="w-36 text-muted-foreground">{formatDateTime(e.occurred_at)}</span>
                  <span className="font-medium">{e.event_type}</span>
                  <StatusBadge status={e.resulting_status} />
                  <span className="text-muted-foreground">by {(e.profiles as { full_name: string } | null)?.full_name ?? "system"} · {e.method}</span>
                  {e.note && <span dir="auto">“{e.note}”</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No check-ins yet.</p>
          )}
        </TabsContent>
        <TabsContent value="history">
          {history?.length ? (
            <ul className="space-y-1 text-sm">
              {history.map((h, i) => {
                const diff = (h.diff ?? {}) as Record<string, { old: unknown; new: unknown }>;
                const src = h.source.startsWith("import:") ? (
                  <Link href={`/admin/imports/${h.source.slice(7)}`} className="underline">
                    import
                  </Link>
                ) : (
                  h.source
                );
                return (
                  <li key={i} className="rounded-md border px-3 py-2">
                    <div className="flex gap-2 text-muted-foreground">
                      <span className="w-36">{formatDateTime(h.at)}</span>
                      <span>
                        {h.action.toLowerCase()} via {src}
                      </span>
                    </div>
                    {h.action === "UPDATE" && (
                      <table className="mt-1 text-xs">
                        <tbody>
                          {Object.entries(diff)
                            .filter(([k]) => !["last_event_id", "updated_at", "source_data"].includes(k))
                            .map(([k, v]) => (
                              <tr key={k}>
                                <td className="pr-3 font-mono text-muted-foreground">{k}</td>
                                <td className="pr-3 line-through" dir="auto">
                                  {String(v.old ?? "")}
                                </td>
                                <td dir="auto">{String(v.new ?? "")}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          )}
        </TabsContent>
        {canEdit && (
          <TabsContent value="edit">
            <ActionForm action={updateCamper} className="grid max-w-3xl gap-4 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] sm:grid-cols-2">
              <input type="hidden" name="id" value={c.id!} />
              <input type="hidden" name="can_edit_sensitive" value={canEditSensitive ? "1" : "0"} />
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First name</Label>
                <Input id="first_name" name="first_name" defaultValue={c.first_name ?? ""} dir="auto" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last name</Label>
                <Input id="last_name" name="last_name" defaultValue={c.last_name ?? ""} dir="auto" required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="placement">Division and bunk</Label>
                <Select id="placement" name="placement" defaultValue={c.bunk_id ? `b:${c.bunk_id}` : c.division_id ? `d:${c.division_id}` : ""}>
                  {!c.division_id && <option value="">Not in a division</option>}
                  {placeable.map((d) => (
                    <optgroup key={d.id} label={d.name}>
                      <option value={`d:${d.id}`}>{d.name} · no bunk yet</option>
                      {d.bunks.map((b) => (
                        <option key={b.id} value={`b:${b.id}`}>
                          {d.name} · {b.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">If you move a camper here, future imports keep your choice instead of the export&apos;s.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="grade">Grade</Label>
                  <Input id="grade" name="grade" defaultValue={c.grade ?? ""} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tshirt_size">T-shirt</Label>
                  <Input id="tshirt_size" name="tshirt_size" defaultValue={c.tshirt_size ?? ""} />
                </div>
              </div>
              {canEditSensitive && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="local_address">Local address</Label>
                    <Input id="local_address" name="local_address" defaultValue={c.local_address ?? ""} dir="auto" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="local_address_cross_streets">Cross streets</Label>
                    <Input id="local_address_cross_streets" name="local_address_cross_streets" defaultValue={c.local_address_cross_streets ?? ""} dir="auto" />
                  </div>
                  {(
                    [
                      ["has_allergies", "Has allergies?"],
                      ["has_epipen", "Needs an EpiPen?"],
                      ["has_medications", "Takes medications?"],
                    ] as const
                  ).map(([k, label]) => (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={k}>{label}</Label>
                      <Select id={k} name={k} defaultValue={c[k] === null || c[k] === undefined ? "" : c[k] ? "true" : "false"}>
                        <option value="">Not known</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </Select>
                    </div>
                  ))}
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="allergies">Allergies (details)</Label>
                    <Input id="allergies" name="allergies" defaultValue={c.allergies ?? ""} dir="auto" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="medical_notes">Medical notes</Label>
                    <Textarea id="medical_notes" name="medical_notes" defaultValue={c.medical_notes ?? ""} dir="auto" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="notes_from_parents">Notes from parents</Label>
                    <Textarea id="notes_from_parents" name="notes_from_parents" defaultValue={c.notes_from_parents ?? ""} dir="auto" />
                  </div>
                </>
              )}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="staff_notes">Staff notes</Label>
                <Textarea id="staff_notes" name="staff_notes" defaultValue={c.staff_notes ?? ""} dir="auto" />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Save changes</Button>
              </div>
            </ActionForm>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
