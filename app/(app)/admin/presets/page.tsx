import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { FIELD_BY_KEY } from "@/lib/fields";
import { deletePreset } from "./actions";

export const metadata = { title: "List presets" };

export default async function PresetsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: presets } = await supabase.from("list_presets").select("id, name, audience, columns, group_by, is_default").order("audience").order("name");
  return (
    <div>
      <PageHeader
        title="List presets"
        description="Which columns each kind of list shows. Sensitive columns only appear for people allowed to see them, whatever the preset says."
        actions={
          <Button asChild>
            <Link href="/admin/presets/new">New preset</Link>
          </Button>
        }
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Audience</TableHead>
            <TableHead>Columns</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(presets ?? []).map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link href={`/admin/presets/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>{" "}
                {p.is_default && <Badge variant="secondary">default</Badge>}
                <div className="text-xs text-muted-foreground">grouped by {p.group_by ?? "nothing"}</div>
              </TableCell>
              <TableCell>{p.audience.replace("_", " ")}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{(p.columns as string[]).map((c) => FIELD_BY_KEY[c]?.label ?? c).join(", ")}</TableCell>
              <TableCell className="text-right">
                <ActionForm action={deletePreset} confirm={`Delete preset "${p.name}"?`}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button size="sm" variant="ghost" className="text-destructive" type="submit">
                    Delete
                  </Button>
                </ActionForm>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
