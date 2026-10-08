import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireDirector } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { addScope, removeScope, resendInvite, setActive, updateProfile } from "../actions";
import { BunkPicker } from "./bunk-picker";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireDirector();
  const { id } = await params;
  const session = await getActiveSession();
  const supabase = await createClient();
  const [{ data: p }, { data: scopes }, { data: divisions }, { data: bunks }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, phone, global_role, is_active, created_at").eq("id", id).maybeSingle(),
    supabase.from("staff_scopes").select("id, division_id, bunk_id, scope_role, access_level").eq("user_id", id),
    session ? supabase.from("divisions").select("id, name").eq("session_id", session.id).order("sort_order") : Promise.resolve({ data: [] }),
    supabase.from("bunks").select("id, division_id, name").order("sort_order"),
  ]);
  if (!p) notFound();
  const divName = (did: string) => divisions?.find((d) => d.id === did)?.name ?? "?";
  const bunkName = (bid: string | null) => (bid ? bunks?.find((b) => b.id === bid)?.name ?? "?" : "all bunks");
  const admin = isAdmin(me);

  return (
    <div>
      <PageHeader
        title={p.full_name}
        description={p.email}
        actions={
          <>
            {admin && (
              <ActionForm action={resendInvite}>
                <input type="hidden" name="email" value={p.email} />
                <Button variant="outline" size="sm" type="submit">
                  Send sign-in link
                </Button>
              </ActionForm>
            )}
            {admin && (
              <ActionForm action={setActive} confirm={p.is_active ? "Deactivate this account? They lose access immediately." : undefined}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={p.is_active ? "false" : "true"} />
                <Button variant={p.is_active ? "destructive" : "default"} size="sm" type="submit">
                  {p.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              </ActionForm>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Global role gives access everywhere; &quot;staff&quot; only gets what is listed under Access.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateProfile} className="space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <div className="space-y-1">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" name="full_name" defaultValue={p.full_name} disabled={!admin} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" defaultValue={p.phone ?? ""} disabled={!admin} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="global_role">Global role</Label>
                <Select id="global_role" name="global_role" defaultValue={p.global_role} disabled={!admin || (p.global_role === "owner" && me.role !== "owner")}>
                  <option value="staff">staff</option>
                  <option value="logistics">logistics</option>
                  <option value="office">office</option>
                  <option value="director">director</option>
                  <option value="admin">admin</option>
                  {(me.role === "owner" || p.global_role === "owner") && <option value="owner">owner</option>}
                </Select>
              </div>
              {admin && <Button type="submit">Save</Button>}
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>Division, bunk (or all), what they are there, and how much they may do.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Division</TableHead>
                  <TableHead>Bunk</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(scopes ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell dir="auto">{divName(s.division_id)}</TableCell>
                    <TableCell dir="auto">{bunkName(s.bunk_id)}</TableCell>
                    <TableCell>{s.scope_role.replace("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.access_level}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ActionForm action={removeScope}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="user_id" value={p.id} />
                        <Button size="sm" variant="ghost" className="text-destructive" type="submit">
                          Remove
                        </Button>
                      </ActionForm>
                    </TableCell>
                  </TableRow>
                ))}
                {!scopes?.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No division access yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {session && (
              <ActionForm action={addScope} className="grid gap-2 sm:grid-cols-2" resetOnSuccess>
                <input type="hidden" name="user_id" value={p.id} />
                <BunkPicker divisions={divisions ?? []} bunks={bunks ?? []} />
                <div className="space-y-1">
                  <Label htmlFor="scope_role">Role there</Label>
                  <Select id="scope_role" name="scope_role" defaultValue="counselor">
                    <option value="counselor">counselor</option>
                    <option value="head_counselor">head counselor</option>
                    <option value="division_head">division head</option>
                    <option value="scanner">scanner (check-in helper)</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="access_level">Level</Label>
                  <Select id="access_level" name="access_level" defaultValue="scan">
                    <option value="view">view – see status and contacts</option>
                    <option value="scan">scan – check in/out, request tags</option>
                    <option value="edit">edit – also update camper details</option>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" variant="secondary">
                    Add access
                  </Button>
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
