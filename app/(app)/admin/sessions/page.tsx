import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { activateSession, createSession } from "./actions";

export const metadata = { title: "Sessions" };

export default async function SessionsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: sessions } = await supabase.from("sessions").select("id, name, starts_on, ends_on, is_active, created_at").order("created_at", { ascending: false });
  return (
    <div>
      <PageHeader title="Sessions" description="One session per run of the program. The active one is what everybody sees." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sessions ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  {s.name} {s.is_active && <Badge variant="success">active</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.starts_on ?? "—"} → {s.ends_on ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {!s.is_active && (
                    <ActionForm action={activateSession} confirm={`Make "${s.name}" the active session?`}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button size="sm" variant="outline">
                        Activate
                      </Button>
                    </ActionForm>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!sessions?.length && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No sessions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Card>
          <CardHeader>
            <CardTitle>New session</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createSession} className="space-y-3" resetOnSuccess>
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="Kinus 5787" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="starts_on">Starts</Label>
                  <Input id="starts_on" name="starts_on" type="date" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ends_on">Ends</Label>
                  <Input id="ends_on" name="ends_on" type="date" />
                </div>
              </div>
              <Button type="submit">Create</Button>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
