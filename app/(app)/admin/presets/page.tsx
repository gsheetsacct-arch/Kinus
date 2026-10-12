import Link from "next/link";
import { ChevronRight, Copy, Plus } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { loadExtraFields } from "@/lib/data/extra-fields";
import { copyPreset } from "./actions";
import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/callout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/current-user";
import { FIELD_BY_KEY } from "@/lib/fields";
import { AUDIENCES } from "@/lib/labels";

export const metadata = { title: "List layouts" };

export default async function PresetsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: presets }, extras] = await Promise.all([
    supabase.from("list_presets").select("id, name, audience, columns, group_by, is_default").order("audience").order("name"),
    loadExtraFields(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="List layouts"
        description="Which columns each kind of printed list shows."
        actions={
          <Button asChild>
            <Link href="/admin/presets/new">
              <Plus /> New layout
            </Link>
          </Button>
        }
      />
      <Callout>
        A layout is a saved choice of columns. Each person picks from the layouts meant for their role on the <strong>Lists</strong> page. Private columns, like medical details,
        only print for people allowed to see them, whatever the layout says.
      </Callout>
      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        {(presets ?? []).map((p) => {
          const cols = (p.columns as string[]).map((c) => FIELD_BY_KEY[c]?.label ?? extras.find((f) => `source.${f.column}` === c)?.label ?? c);
          return (
            <div key={p.id} className="flex items-center gap-2 border-b pr-3 last:border-0 hover:bg-muted/40">
            <Link href={`/admin/presets/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4">
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="primary">For {AUDIENCES[p.audience]?.toLowerCase() ?? p.audience}</Badge>
                  {p.is_default && <Badge variant="secondary">Default</Badge>}
                </span>
                <span className="flex flex-wrap gap-1">
                  {cols.slice(0, 7).map((c) => (
                    <span key={c} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {c}
                    </span>
                  ))}
                  {cols.length > 7 && <span className="px-1 text-xs text-muted-foreground">+{cols.length - 7} more</span>}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
            <ActionForm action={copyPreset}>
              <input type="hidden" name="id" value={p.id} />
              <Button type="submit" size="sm" variant="ghost" title="Make a copy to change">
                <Copy /> Copy
              </Button>
            </ActionForm>
            </div>
          );
        })}
      </div>
    </div>
  );
}
