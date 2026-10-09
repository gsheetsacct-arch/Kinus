import Link from "next/link";
import { redirect } from "next/navigation";
import { Copy, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { isAdmin } from "@/lib/auth/permissions";
import { duplicateTemplate } from "../actions";

export const metadata = { title: "Templates" };
const KIND: Record<string, string> = { name_tag: "Name tag", luggage_tag: "Luggage tag", other: "Other" };

export default async function TemplatesPage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/print");
  const supabase = await createClient();
  const { data } = await supabase.from("print_templates").select("id, name, kind, page_width_mm, page_height_mm, show_on_card, auto_on_first_checkin, sheet_layout, background_path, layers").order("sort_order").order("name");
  return (
    <div>
      <PageHeader
        title="Templates"
        description="The designs for name tags, luggage tags and anything else printed per camper."
        actions={
          <Button asChild size="sm">
            <Link href="/print/templates/new">
              <Plus /> New template
            </Link>
          </Button>
        }
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {(data ?? []).map((t) => {
          const sheet = t.sheet_layout as { cols: number; rows: number; paper: string } | null;
          return (
            <li key={t.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/print/templates/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                <ActionForm action={duplicateTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <Button size="sm" variant="ghost" type="submit" title="Make a copy to change">
                    <Copy /> Copy
                  </Button>
                </ActionForm>
              </div>
              <p className="text-sm text-muted-foreground">
                {KIND[t.kind]} · {Number(t.page_width_mm)} × {Number(t.page_height_mm)} mm · {(t.layers as unknown[]).length} parts
                {sheet ? ` · ${sheet.cols * sheet.rows} per ${sheet.paper === "a4" ? "A4" : "Letter"} sheet` : " · one per label"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {t.show_on_card && <Badge variant="secondary">button on camper card</Badge>}
                {t.auto_on_first_checkin && <Badge variant="warning">prints on first check-in</Badge>}
                {t.background_path && <Badge variant="outline">background image</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
