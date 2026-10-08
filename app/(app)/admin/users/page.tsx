import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireDirector } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { inviteUser } from "./actions";

export const metadata = { title: "Staff" };

export default async function UsersPage() {
  const me = await requireDirector();
  const supabase = await createClient();
  const [{ data: profiles }, { data: scopes }, { data: divisions }, { data: bunks }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, global_role, is_active").order("full_name"),
    supabase.from("staff_scopes").select("id, user_id, division_id, bunk_id, scope_role, access_level"),
    supabase.from("divisions").select("id, name"),
    supabase.from("bunks").select("id, name"),
  ]);
  const divName = (id: string) => divisions?.find((d) => d.id === id)?.name ?? "?";
  const bunkName = (id: string | null) => (id ? bunks?.find((b) => b.id === id)?.name ?? "?" : "all bunks");

  return (
    <div>
      <PageHeader title="Staff" description="Who can sign in, their global role, and which divisions and bunks they can reach." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(profiles ?? []).map((p) => (
              <TableRow key={p.id} className={!p.is_active ? "opacity-50" : undefined}>
                <TableCell>
                  <Link href={`/admin/users/${p.id}`} className="font-medium underline-offset-2 hover:underline">
                    {p.full_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.global_role === "staff" ? "outline" : "secondary"}>{p.global_role}</Badge>
                  {!p.is_active && <Badge variant="destructive" className="ml-1">inactive</Badge>}
                </TableCell>
                <TableCell className="space-x-1 space-y-1">
                  {(scopes ?? [])
                    .filter((s) => s.user_id === p.id)
                    .map((s) => (
                      <Badge key={s.id} variant="outline">
                        <span dir="auto">{divName(s.division_id)}</span> · {bunkName(s.bunk_id)} · {s.scope_role.replace("_", " ")} · {s.access_level}
                      </Badge>
                    ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {isAdmin(me) && (
          <Card>
            <CardHeader>
              <CardTitle>Invite staff</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={inviteUser} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input id="full_name" name="full_name" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="global_role">Global role</Label>
                  <Select id="global_role" name="global_role" defaultValue="staff">
                    <option value="staff">Staff (access only via divisions/bunks)</option>
                    <option value="logistics">Logistics</option>
                    <option value="office">Office</option>
                    <option value="director">Director</option>
                    <option value="admin">Admin</option>
                    {me.role === "owner" && <option value="owner">Owner</option>}
                  </Select>
                </div>
                <Button type="submit">Send invitation</Button>
                <p className="text-xs text-muted-foreground">They get an email with a link to set a password. Add division/bunk access on their page next.</p>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
