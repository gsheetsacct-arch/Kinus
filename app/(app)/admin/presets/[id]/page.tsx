import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { FIELDS, UNGATED_GROUPS } from "@/lib/fields";
import { savePreset } from "../actions";

export default async function PresetEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const supabase = await createClient();
  const preset = isNew ? null : (await supabase.from("list_presets").select("*").eq("id", id).maybeSingle()).data;
  if (!isNew && !preset) notFound();
  const columns = new Set((preset?.columns as string[] | undefined) ?? ["display_name", "bunk"]);
  const sort = (preset?.sort as { field: string; dir: string }[] | undefined) ?? [];
  const sortField = sort.find((s) => s.field !== preset?.group_by)?.field ?? "last_name";

  return (
    <div>
      <PageHeader title={isNew ? "New preset" : `Edit: ${preset!.name}`} />
      <ActionForm action={savePreset} className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <input type="hidden" name="id" value={preset?.id ?? ""} />
        <Card>
          <CardHeader>
            <CardTitle>Preset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={preset?.name ?? ""} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="audience">Audience</Label>
              <Select id="audience" name="audience" defaultValue={preset?.audience ?? "counselor"}>
                <option value="counselor">counselors</option>
                <option value="head_counselor">head counselors</option>
                <option value="division_head">division heads</option>
                <option value="director">directors</option>
                <option value="office">office</option>
                <option value="custom">custom (anyone)</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="group_by">Group by</Label>
              <Select id="group_by" name="group_by" defaultValue={preset?.group_by ?? "bunk"}>
                <option value="bunk">bunk</option>
                <option value="division">division</option>
                <option value="">nothing</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sort_field">Sort by</Label>
              <Select id="sort_field" name="sort_field" defaultValue={sortField}>
                <option value="last_name">last name</option>
                <option value="first_name">first name</option>
                <option value="camper_code">code</option>
                <option value="grade">grade</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_default" defaultChecked={preset?.is_default ?? false} className="size-4" /> Default for this audience
            </label>
            <Button type="submit" className="w-full">
              Save preset
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Columns</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input type="checkbox" name="columns" value={f.key} defaultChecked={columns.has(f.key)} className="size-4" />
                <span className="flex-1">{f.label}</span>
                {!UNGATED_GROUPS.includes(f.group) && <span className="text-[10px] uppercase text-muted-foreground">{f.group.replace("_", " ")}</span>}
              </label>
            ))}
          </CardContent>
        </Card>
      </ActionForm>
    </div>
  );
}
