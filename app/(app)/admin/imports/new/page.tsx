import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { uploadImport } from "../actions";

export const metadata = { title: "New import" };

export default async function NewImportPage() {
  await requireAdmin();
  const session = await getActiveSession();
  const supabase = await createClient();
  const { data: mappings } = await supabase.from("import_mappings").select("id, name, is_default").order("is_default", { ascending: false }).order("name");
  return (
    <div className="max-w-xl">
      <PageHeader title="New import" description={session ? `Into ${session.name}` : undefined} />
      {!session && <Alert variant="warning"><AlertDescription>Activate a session first.</AlertDescription></Alert>}
      {session && (
        <Card>
          <CardHeader>
            <CardTitle>1 · Upload the export</CardTitle>
            <CardDescription>
              .csv or .xlsx straight from the registration system. Do not open and re-save it in WPS or Excel first: Hebrew and French text can be lost.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={uploadImport} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="file">File</Label>
                <Input id="file" name="file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mapping_id">Column mapping preset</Label>
                <Select id="mapping_id" name="mapping_id" defaultValue={mappings?.find((m) => m.is_default)?.id ?? ""}>
                  {(mappings ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="">Start from an empty mapping</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="override" className="size-4" /> Import anyway if cells contain &quot;??&quot; (they are real question marks)
              </label>
              <Button type="submit" size="lg">
                Upload and map columns
              </Button>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
