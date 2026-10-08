import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { deleteBunk, deleteDivision, saveBunk, saveDivision } from "./actions";

export const metadata = { title: "Divisions & bunks" };

const LANG: Record<string, string> = { he: "Hebrew", fr: "French", en: "English" };

export default async function DivisionsPage() {
  await requireAdmin();
  const session = await getActiveSession();
  if (!session) return <Alert><AlertDescription>Activate a session first.</AlertDescription></Alert>;
  const supabase = await createClient();
  const [{ data: divisions }, { data: bunks }, { data: campers }] = await Promise.all([
    supabase.from("divisions").select("id, name, language, color, sort_order").eq("session_id", session.id).order("sort_order").order("name"),
    supabase.from("bunks").select("id, division_id, name, sort_order").order("sort_order").order("name"),
    supabase.from("campers").select("id, division_id, bunk_id").eq("session_id", session.id).is("archived_at", null),
  ]);
  const countIn = (divisionId: string, bunkId?: string) =>
    (campers ?? []).filter((c) => c.division_id === divisionId && (bunkId === undefined || c.bunk_id === bunkId)).length;

  return (
    <div>
      <PageHeader title="Divisions & bunks" description="Imports create these automatically; rename, reorder and merge here." />
      <div className="grid gap-4 lg:grid-cols-2">
        {(divisions ?? []).map((d) => {
          const dBunks = (bunks ?? []).filter((b) => b.division_id === d.id);
          return (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {d.color && <span className="size-3 rounded-full" style={{ background: d.color }} />}
                    <span dir="auto">{d.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {LANG[d.language]} · {countIn(d.id)} campers
                    </span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ActionForm action={saveDivision} className="grid grid-cols-[1fr_110px_90px_60px_auto] items-end gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="session_id" value={session.id} />
                  <Input name="name" defaultValue={d.name} dir="auto" aria-label="Division name" />
                  <Select name="language" defaultValue={d.language} aria-label="Language">
                    <option value="en">English</option>
                    <option value="he">Hebrew</option>
                    <option value="fr">French</option>
                  </Select>
                  <Input name="color" type="color" defaultValue={d.color ?? "#64748b"} aria-label="Colour" className="h-10 p-1" />
                  <Input name="sort_order" type="number" defaultValue={d.sort_order} aria-label="Order" />
                  <Button size="sm" variant="outline" type="submit">
                    Save
                  </Button>
                </ActionForm>
                <div className="space-y-1">
                  {dBunks.map((b) => (
                    <div key={b.id} className="flex items-center gap-2">
                      <ActionForm action={saveBunk} className="flex flex-1 items-center gap-2">
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="division_id" value={d.id} />
                        <Input name="name" defaultValue={b.name} dir="auto" className="h-9" aria-label="Bunk name" />
                        <Input name="sort_order" type="number" defaultValue={b.sort_order} className="h-9 w-16" aria-label="Order" />
                        <span className="w-16 text-xs text-muted-foreground">{countIn(d.id, b.id)} campers</span>
                        <Button size="sm" variant="ghost" type="submit">
                          Save
                        </Button>
                      </ActionForm>
                      <ActionForm action={deleteBunk} confirm={`Delete bunk "${b.name}"? Its campers move to the chosen bunk or become unassigned.`} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={b.id} />
                        <Select name="move_to" className="h-9 w-32 text-xs" aria-label="Move campers to">
                          <option value="">(unassign)</option>
                          {dBunks.filter((x) => x.id !== b.id).map((x) => (
                            <option key={x.id} value={x.id}>
                              → {x.name}
                            </option>
                          ))}
                        </Select>
                        <Button size="sm" variant="ghost" className="text-destructive" type="submit">
                          Delete
                        </Button>
                      </ActionForm>
                    </div>
                  ))}
                  <ActionForm action={saveBunk} className="flex items-center gap-2" resetOnSuccess>
                    <input type="hidden" name="division_id" value={d.id} />
                    <Input name="name" placeholder="New bunk" dir="auto" className="h-9" required />
                    <Input name="sort_order" type="number" defaultValue={dBunks.length + 1} className="h-9 w-16" aria-label="Order" />
                    <Button size="sm" variant="secondary" type="submit">
                      Add bunk
                    </Button>
                  </ActionForm>
                </div>
                {countIn(d.id) === 0 && (
                  <ActionForm action={deleteDivision} confirm={`Delete division "${d.name}"?`}>
                    <input type="hidden" name="id" value={d.id} />
                    <Button size="sm" variant="ghost" className="text-destructive" type="submit">
                      Delete division
                    </Button>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardHeader>
            <CardTitle>New division</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveDivision} className="grid grid-cols-[1fr_110px_60px_auto] items-end gap-2" resetOnSuccess>
              <input type="hidden" name="session_id" value={session.id} />
              <Input name="name" placeholder="Division name (as in the export)" dir="auto" required />
              <Select name="language" defaultValue="en" aria-label="Language">
                <option value="en">English</option>
                <option value="he">Hebrew</option>
                <option value="fr">French</option>
              </Select>
              <Input name="sort_order" type="number" defaultValue={(divisions?.length ?? 0) + 1} aria-label="Order" />
              <Button type="submit">Create</Button>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
