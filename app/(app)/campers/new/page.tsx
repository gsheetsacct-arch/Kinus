import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { BunkPicker } from "@/components/bunk-picker";
import { createWalkIn } from "../actions";

export const metadata = { title: "Add a walk-in" };

export default async function NewCamperPage() {
  await requireAdmin();
  const session = await getActiveSession();
  if (!session) return <p className="text-muted-foreground">No active session.</p>;
  const supabase = await createClient();
  const [{ data: divisions }, { data: bunks }] = await Promise.all([
    supabase.from("divisions").select("id, name").eq("session_id", session.id).order("sort_order"),
    supabase.from("bunks").select("id, division_id, name").order("sort_order"),
  ]);
  return (
    <div className="max-w-lg">
      <PageHeader title="Add walk-in camper" />
      <Card>
        <CardHeader>
          <CardTitle>Not from the export</CardTitle>
          <CardDescription>For a camper who shows up without being in the registration file. They stay flagged until an import includes them.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createWalkIn} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" name="first_name" dir="auto" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" dir="auto" required />
            </div>
            <BunkPicker divisions={divisions ?? []} bunks={bunks ?? []} />
            <div className="sm:col-span-2">
              <Button type="submit">Add camper</Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
