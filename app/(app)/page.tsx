import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const session = await getActiveSession();
  const { denied } = await searchParams;
  const supabase = await createClient();

  const divisions = session
    ? (await supabase.from("divisions").select("id, name, language, color, sort_order").eq("session_id", session.id).order("sort_order")).data ?? []
    : [];
  const campers = session ? (await supabase.from("campers_visible").select("id, division_id, status").eq("session_id", session.id).is("archived_at", null)).data ?? [] : [];
  const perDivision = divisions
    .map((d) => ({ ...d, count: campers.filter((c) => c.division_id === d.id).length }))
    .filter((d) => d.count > 0 || isAdmin(user));

  return (
    <div>
      <PageHeader title={`Hello, ${user.fullName.split(" ")[0]}`} description={session ? session.name : "No active session"} />
      {denied && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Not allowed</AlertTitle>
          <AlertDescription>That page needs {denied} access.</AlertDescription>
        </Alert>
      )}
      {!session && isAdmin(user) && (
        <Alert className="mb-4">
          <AlertTitle>Set up the session</AlertTitle>
          <AlertDescription>
            Create and activate this year&apos;s session, then upload the registration export.{" "}
            <Link href="/admin/sessions" className="underline">
              Sessions
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {session && campers.length === 0 && isAdmin(user) && (
        <Alert className="mb-4">
          <AlertTitle>No campers yet</AlertTitle>
          <AlertDescription>
            Upload the registration export to fill the roster.{" "}
            <Button asChild size="sm" className="ml-2">
              <Link href="/admin/imports/new">New import</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Campers you can see</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{campers.length}</CardContent>
        </Card>
        {perDivision.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                {d.color && <span className="size-2.5 rounded-full" style={{ background: d.color }} />}
                <span dir="auto">{d.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <span className="text-3xl font-semibold">{d.count}</span>
              <Link href={`/campers?division=${d.id}`} className="text-sm underline">
                Open
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
