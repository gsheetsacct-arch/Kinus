import Link from "next/link";
import { redirect } from "next/navigation";
import { Copy, Plus, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/current-user";
import { canDesign, loadDesigners } from "@/lib/print/designers";
import { isAdmin } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_ROLES } from "@/lib/labels";
import { DesignersBox } from "@/components/print/designers-box";
import { FontsBox } from "@/components/print/fonts-box";
import { ClaudeBox } from "@/components/print/claude-box";
import { appUrl } from "@/lib/auth/app-url";
import { connectorsOf } from "@/lib/print/design-connectors";
import { customFontLinks, loadCustomFonts } from "@/lib/print/custom-fonts";
import { customFamily } from "@/lib/print/font-families";
import { duplicateTemplate } from "../actions";
import { currentPreset } from "@/lib/print/presets";
import { templateCamps } from "@/lib/print/template-camps";
import type { SheetLayout } from "@/lib/print/types";
import { forCampers } from "@/lib/print/staff-values";

export const metadata = { title: "Templates" };
const KIND: Record<string, string> = { name_tag: "Name tag", luggage_tag: "Luggage tag", other: "Other" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ retired?: string }> }) {
  const showRetired = (await searchParams).retired === "1";
  const user = await requireUser();
  if (!(await canDesign(user))) redirect("/print");
  const supabase = await createClient();
  const [{ data }, designerIds, staffRows, fonts, links] = await Promise.all([
    supabase.from("print_templates").select("*").order("sort_order").order("name"),
    loadDesigners(),
    // who can be allowed to edit templates: people with their own sign-in (directors only see this)
    isAdmin(user)
      ? createAdminClient().from("profiles").select("id, full_name, role, all_areas").eq("is_active", true).eq("login", "personal").order("full_name").then((r) => r.data ?? [])
      : Promise.resolve([]),
    loadCustomFonts(),
    connectorsOf(user.id),
  ]);
  const roleName = (r: string) => STAFF_ROLES[r as keyof typeof STAFF_ROLES]?.label ?? r;
  const allowable = staffRows.filter((p) => !(p.role === "owner" || (p.role === "director" && p.all_areas))).map((p) => ({ id: p.id, name: p.full_name, role: roleName(p.role) }));
  const designers = designerIds.map((id) => allowable.find((p) => p.id === id) ?? null).filter((p): p is NonNullable<typeof p> => Boolean(p));
  // retired: used before, so kept for the print history, but no longer offered
  const isRetired = (t: { name: string }) => t.name.startsWith("(retired)");
  const retired = (data ?? []).filter(isRetired);
  const shown = (data ?? []).filter((t) => showRetired === isRetired(t));
  return (
    <div>
      <PageHeader
        title={showRetired ? "Retired templates" : "Templates"}
        description={
          showRetired ? "No longer offered for printing; kept so past print jobs still open." : "The designs for name tags, luggage tags and anything else printed per camper, and staff tags."
        }
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/print/templates/new">
                <Plus /> New template
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/print/templates/new?for=staff">
                <UserRound /> New staff template
              </Link>
            </Button>
          </>
        }
      />
      {[
        { title: null, list: shown.filter(forCampers) },
        // staff tags: filled from the staff list, printed from Print → Staff tags (migration 0041)
        { title: "For staff", list: shown.filter((t) => !forCampers(t)) },
      ].map(({ title, list }) =>
        title && !list.length ? null : (
          <section key={title ?? "campers"} className={title ? "mt-8 space-y-3" : undefined}>
            {title && (
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">
                  Name tags and badges for staff, printed from{" "}
                  <Link href="/print/staff" className="text-primary hover:underline">
                    Staff tags
                  </Link>
                  .
                </p>
              </div>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((t) => {
                const sheet = t.sheet_layout as SheetLayout | null;
                const preset = currentPreset(Number(t.page_width_mm), Number(t.page_height_mm), sheet);
                return (
                  <li key={t.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/print/templates/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      <span className="flex">
                        <ActionForm action={duplicateTemplate}>
                          <input type="hidden" name="id" value={t.id} />
                          <Button size="sm" variant="ghost" type="submit" title="Make a copy to change">
                            <Copy /> Copy
                          </Button>
                        </ActionForm>
                        {forCampers(t) && (
                          <ActionForm action={duplicateTemplate}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="audience" value="staff" />
                            <Button size="sm" variant="ghost" type="submit" title="A copy of this design for staff tags">
                              <UserRound /> For staff
                            </Button>
                          </ActionForm>
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {KIND[t.kind]} · {Number(t.page_width_mm)} × {Number(t.page_height_mm)} mm · {(t.layers as unknown[]).length} parts
                      {preset ? ` · ${preset.brand} ${preset.product}` : ""}
                      {sheet ? ` · ${sheet.cols * sheet.rows} per ${sheet.paper === "a4" ? "A4" : "Letter"} sheet` : " · one per label"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Number((t as { copies?: number }).copies) > 1 && (
                        <Badge variant="secondary">
                          {(t as { copies?: number }).copies} per {forCampers(t) ? "camper" : "person"}
                        </Badge>
                      )}
                      {t.show_on_card && <Badge variant="secondary">print button at check-in</Badge>}
                      {t.auto_on_first_checkin && <Badge variant="warning">prints by itself at first check-in</Badge>}
                      {t.background_path && <Badge variant="outline">background image</Badge>}
                      {templateCamps(t).length > 0 && <Badge variant="primary">{templateCamps(t).join(" · ")} only</Badge>}
                      {Boolean((t as { back?: unknown }).back) && <Badge variant="outline">both sides</Badge>}
                      {Boolean((t as { thermal?: boolean }).thermal) && <Badge variant="outline">thermal printer</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
      {showRetired && !shown.length && <p className="text-sm text-muted-foreground">No retired templates.</p>}
      {(retired.length > 0 || showRetired) && (
        <p className="mt-4 text-sm text-muted-foreground">
          {showRetired ? (
            <Link href="/print/templates" className="hover:text-primary hover:underline">
              Back to the templates in use
            </Link>
          ) : (
            <Link href="/print/templates?retired=1" className="hover:text-primary hover:underline">
              {retired.length} retired {retired.length === 1 ? "template is" : "templates are"} hidden (kept because they were printed before). Show
            </Link>
          )}
        </p>
      )}
      {!showRetired && (
        <div className="mt-8 space-y-6">
          <style dangerouslySetInnerHTML={{ __html: customFontLinks(fonts) }} />
          <ClaudeBox links={links} connector={`${await appUrl()}/api/mcp`} />
          <FontsBox fonts={fonts.map((f) => ({ id: f.id, name: f.name, family: customFamily(f.id), files: f.files.map(({ weight, italic }) => ({ weight, italic })) }))} />
          {isAdmin(user) && <DesignersBox designers={designers} staff={allowable} />}
        </div>
      )}
    </div>
  );
}
