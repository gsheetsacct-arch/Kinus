import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { saveFieldVisibility, saveImportSettings, saveOfficeEmail } from "./actions";

export const metadata = { title: "Settings" };

const GLOBAL = ["owner", "admin", "director", "logistics", "office", "staff"] as const;
const SCOPE = ["division_head", "head_counselor", "counselor", "scanner"] as const;
const GROUP_LABEL: Record<string, string> = {
  contacts: "Parent & emergency contacts",
  medical: "Medical details (notes, allergies, EpiPen, medications)",
  parent_notes: "Notes from parents",
  address: "Local address",
  staff_notes: "Staff notes",
};

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: fv }, { data: settings }] = await Promise.all([
    supabase.from("field_visibility").select("field_group, global_roles, scope_roles").order("field_group"),
    supabase.from("settings").select("key, value"),
  ]);
  const setting = (k: string) => (settings?.find((s) => s.key === k)?.value ?? {}) as Record<string, unknown>;
  const officeEmail = setting("office_email");
  const imp = setting("import");

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader>
          <CardTitle>Who can see sensitive fields</CardTitle>
          <CardDescription>
            Rows apply to campers a person can already see. Everyone always sees a yes/no &quot;medical flag&quot;. Global roles marked here see the fields everywhere;
            scope roles see them within their division/bunk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveFieldVisibility} className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Field group</th>
                    {GLOBAL.map((r) => (
                      <th key={r} className="px-2 py-2 font-medium">
                        {r}
                      </th>
                    ))}
                    <th className="w-4" />
                    {SCOPE.map((r) => (
                      <th key={r} className="px-2 py-2 font-medium">
                        {r.replace("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(fv ?? []).map((row) => (
                    <tr key={row.field_group} className="border-t">
                      <td className="py-2 pr-3">
                        <input type="hidden" name="group" value={row.field_group} />
                        <div className="font-medium">{row.field_group}</div>
                        <div className="text-xs text-muted-foreground">{GROUP_LABEL[row.field_group]}</div>
                      </td>
                      {GLOBAL.map((r) => (
                        <td key={r} className="px-2 py-2 text-center">
                          <input type="checkbox" name={`${row.field_group}:g:${r}`} defaultChecked={row.global_roles.includes(r)} className="size-4" disabled={r === "owner"} />
                          {r === "owner" && <input type="hidden" name={`${row.field_group}:g:owner`} value="on" />}
                        </td>
                      ))}
                      <td />
                      {SCOPE.map((r) => (
                        <td key={r} className="px-2 py-2 text-center">
                          <input type="checkbox" name={`${row.field_group}:s:${r}`} defaultChecked={row.scope_roles.includes(r)} className="size-4" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="submit">Save visibility</Button>
          </ActionForm>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Office email</CardTitle>
            <CardDescription>Where tag print requests are sent. Staff can override it per request.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveOfficeEmail} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="to">To</Label>
                <Input id="to" name="to" type="email" defaultValue={String(officeEmail.to ?? "")} placeholder="office@example.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc">CC (comma separated)</Label>
                <Input id="cc" name="cc" defaultValue={Array.isArray(officeEmail.cc) ? (officeEmail.cc as string[]).join(", ") : ""} />
              </div>
              <Button type="submit">Save</Button>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Imports</CardTitle>
            <CardDescription>Warn loudly when an export seems partial.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveImportSettings} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="missingThresholdPct">Warn if more than this % of a division is missing from the file</Label>
                <Input id="missingThresholdPct" name="missingThresholdPct" type="number" min={0} max={100} defaultValue={Number(imp.missingThresholdPct ?? 20)} />
              </div>
              <Button type="submit">Save</Button>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
