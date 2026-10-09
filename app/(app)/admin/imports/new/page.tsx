import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Steps, IMPORT_STEPS } from "@/components/steps";
import { EmptyState } from "@/components/empty-state";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { uploadImport } from "../actions";
import { FilePicker } from "./file-picker";

export const metadata = { title: "Upload export" };

export default async function NewImportPage() {
  await requireAdmin();
  const session = await getActiveSession();
  if (!session) {
    return <EmptyState icon={UploadCloud} title="No active session" description="Create or activate a session first." action={<Button asChild><Link href="/admin/sessions">Sessions</Link></Button>} />;
  }
  const supabase = await createClient();
  const { data: mappings } = await supabase.from("import_mappings").select("id, name, is_default").order("is_default", { ascending: false }).order("name");
  return (
    <div className="max-w-2xl">
      <PageHeader back={{ href: "/admin/imports", label: "Import roster" }} title="Upload the export" description={`Into ${session.name}`} />
      <Steps steps={IMPORT_STEPS} current={1} />
      <Section>
        <ActionForm action={uploadImport} className="space-y-5">
          <FilePicker />
          <details className="group rounded-lg border bg-background px-4 py-3 text-sm">
            <summary className="cursor-pointer select-none font-medium text-muted-foreground group-open:text-foreground">More options</summary>
            <div className="mt-4 space-y-4">
              <Field label="Column layout" htmlFor="mapping_id" hint="How the export's columns line up with Kinus. The default fits the registration export.">
                <Select id="mapping_id" name="mapping_id" defaultValue={mappings?.find((m) => m.is_default)?.id ?? ""}>
                  {(mappings ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="">Start from scratch</option>
                </Select>
              </Field>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="override" className="mt-0.5 size-4" />
                <span>
                  The file really contains &quot;???&quot; in some names
                  <span className="block text-xs text-muted-foreground">Only tick this if you checked the file. Usually &quot;???&quot; means Hebrew or French letters were lost when the file was saved.</span>
                </span>
              </label>
            </div>
          </details>
          <Button type="submit" size="lg">
            Upload and continue
          </Button>
        </ActionForm>
      </Section>
    </div>
  );
}
