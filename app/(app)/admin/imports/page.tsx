import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Imports" };

const STATUS_VARIANT: Record<string, "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  uploaded: "outline",
  previewed: "warning",
  applied: "success",
  cancelled: "secondary",
  failed: "destructive",
};

export default async function ImportsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: imports } = await supabase
    .from("imports")
    .select("id, file_name, status, uploaded_at, applied_at, summary, profiles:uploaded_by(full_name)")
    .order("uploaded_at", { ascending: false })
    .limit(50);
  return (
    <div>
      <PageHeader
        title="Imports"
        description="Upload the registration export whenever it changes. You see exactly what will change before anything is applied."
        actions={
          <Button asChild>
            <Link href="/admin/imports/new">New import</Link>
          </Button>
        }
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(imports ?? []).map((i) => {
            const s = (i.summary ?? {}) as Record<string, number>;
            return (
              <TableRow key={i.id}>
                <TableCell>
                  <Link href={`/admin/imports/${i.id}`} className="font-medium hover:underline">
                    {i.file_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{formatDateTime(i.uploaded_at)}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[i.status]}>{i.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {i.status === "applied" || i.status === "previewed"
                    ? `${s.added ?? 0} added · ${s.updated ?? 0} changed · ${s.unchanged ?? 0} unchanged · ${s.missing ?? 0} not in file`
                    : "—"}
                </TableCell>
                <TableCell className="text-sm">{(i.profiles as { full_name: string } | null)?.full_name ?? ""}</TableCell>
              </TableRow>
            );
          })}
          {!imports?.length && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No imports yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
