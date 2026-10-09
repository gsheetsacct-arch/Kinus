import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemplateEditor, type EditorTemplate } from "@/components/print/template-editor";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { toSpec } from "@/lib/print/data";
import { deleteTemplate, uploadBackground } from "../../actions";

export const metadata = { title: "Template" };
export const maxDuration = 60;

const BLANK: EditorTemplate = { name: "New template", kind: "name_tag", page_width_mm: 90, page_height_mm: 55, layers: [], sheet_layout: null, show_on_card: false, auto_on_first_checkin: false };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  if (!isAdmin(user)) redirect("/print");
  const supabase = await createClient();
  const { data: fields } = await supabase.from("merge_fields").select("key, label").order("sort_order").order("key");
  let initial = BLANK;
  if (id !== "new") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const { data: t } = await supabase.from("print_templates").select("*").eq("id", id).maybeSingle();
    if (!t) notFound();
    initial = { ...toSpec(t), show_on_card: t.show_on_card, auto_on_first_checkin: t.auto_on_first_checkin };
  }
  const background = initial.id ? (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <h2 className="font-semibold">Background image</h2>
      <p className="text-sm text-muted-foreground">
        Have a design from Publisher? Remove the merge fields from it, export it as a picture (File → Export → Change file type → PNG) and upload it here. The names and barcodes above are
        printed on top.
      </p>
      <ActionForm action={uploadBackground} className="flex flex-wrap items-center gap-2" resetOnSuccess>
        <input type="hidden" name="id" value={initial.id} />
        <Input type="file" name="file" accept="image/png,image/jpeg,image/webp" className="max-w-xs" required />
        <Button type="submit" variant="outline">
          Upload
        </Button>
      </ActionForm>
      {initial.background_path && (
        <ActionForm action={uploadBackground}>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="remove" value="1" />
          <Button type="submit" variant="ghost" size="sm" className="text-destructive">
            Remove the background
          </Button>
        </ActionForm>
      )}
    </section>
  ) : (
    <p className="text-sm text-muted-foreground">Save the template first to add a background image.</p>
  );
  return (
    <div>
      <PageHeader
        back={{ href: "/print/templates", label: "Templates" }}
        title={initial.id ? initial.name : "New template"}
        actions={
          initial.id ? (
            <FormDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  Delete
                </Button>
              }
              title={`Delete ${initial.name}?`}
              description="If it was ever printed, it's retired instead so the print history stays readable."
              action={deleteTemplate}
              submitLabel="Delete"
              destructive
            >
              <input type="hidden" name="id" value={initial.id} />
              <input type="hidden" name="name" value={initial.name} />
            </FormDialog>
          ) : undefined
        }
      />
      <TemplateEditor key={initial.id ?? "new"} initial={initial} fields={fields ?? []} background={background} />
    </div>
  );
}
