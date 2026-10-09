import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { FieldsEditor } from "@/components/print/fields-editor";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { FIELDS } from "@/lib/fields";
import { loadMergeSetup, loadPrintCampers } from "@/lib/print/data";
import { sourceValues } from "@/lib/print/merge";
import { getCampContext } from "@/lib/data/camp";

export const metadata = { title: "Fields & conversions" };

export default async function FieldsPage() {
  const [user, session, camp] = await Promise.all([requireUser(), getActiveSession(), getCampContext()]);
  if (!isAdmin(user)) redirect("/print");
  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: fields }, setup, sampleRow] = await Promise.all([
    supabase.from("merge_fields").select("*").order("sort_order").order("key"),
    loadMergeSetup(admin),
    // a real camper, to show what each field turns into
    session
      ? (() => {
          let q = supabase.from("campers").select("id").eq("session_id", session.id).is("archived_at", null);
          if (camp.divisionIds) q = q.in("division_id", camp.divisionIds);
          // prefer one with a t-shirt size and a bunk, so more examples show something
          return q.order("tshirt_size", { nullsFirst: false }).order("bunk_id", { nullsFirst: false }).limit(1).maybeSingle();
        })()
      : Promise.resolve({ data: null }),
  ]);
  const catalog = [...FIELDS.filter((f) => f.kind !== "bool" && f.key !== "status").map((f) => ({ key: f.key, label: f.label })), { key: "division", label: "Division" }, { key: "bunk", label: "Bunk" }, { key: "division_color", label: "Division colour" }];
  const unique = [...new Map(catalog.map((c) => [c.key, c])).values()];
  let sample: Record<string, string> = {};
  let sampleName = "";
  if (sampleRow.data) {
    const [c] = await loadPrintCampers(admin, [sampleRow.data.id]);
    if (c) {
      const get = sourceValues(c);
      sample = Object.fromEntries(unique.map((f) => [f.key, get(f.key)]));
      sampleName = `${c.first_name} ${c.last_name}`;
    }
  }
  return (
    <div>
      <PageHeader
        title="Fields & conversions"
        description="The «fields» you can put on a tag, and how camper details are turned into them, like “Youth Small” → YS or “Division 2” → 2. Only fields on the merge list are offered in templates and in the data for Publisher."
      />
      <FieldsEditor
        fields={(fields ?? []).map((f) => ({ id: f.id, key: f.key, label: f.label, source_field: f.source_field, transforms: (f.transforms as never) ?? [], enabled: (f as { enabled?: boolean }).enabled ?? true }))}
        maps={[...setup.maps.values()].map((m) => ({ id: m.id, name: m.name, source_field: m.source_field, entries: m.entries }))}
        catalog={unique}
        sample={sample}
        sampleName={sampleName}
      />
    </div>
  );
}
