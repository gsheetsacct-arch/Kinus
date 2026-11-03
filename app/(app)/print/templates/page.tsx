import Link from "next/link";
import { redirect } from "next/navigation";
import { Copy, FolderMinus, FolderOpen, Plus, Sparkles, UserRound } from "lucide-react";
import { MoveToFolder, RenameFolder } from "@/components/print/template-folders";
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
  const [{ data }, designerIds, staffRows, fonts] = await Promise.all([
    supabase.from("print_templates").select("*").order("sort_order").order("name"),
    loadDesigners(),
    // who can be allowed to edit templates: people with their own sign-in (directors only see this)
    isAdmin(user)
      ? createAdminClient().from("profiles").select("id, full_name, role, all_areas").eq("is_active", true).eq("login", "personal").order("full_name").then((r) => r.data ?? [])
      : Promise.resolve([]),
    loadCustomFonts(),
  ]);
  const roleName = (r: string) => STAFF_ROLES[r as keyof typeof STAFF_ROLES]?.label ?? r;
  const allowable = staffRows.filter((p) => !(p.role === "owner" || (p.role === "director" && p.all_areas))).map((p) => ({ id: p.id, name: p.full_name, role: roleName(p.role) }));
  const designers = designerIds.map((id) => allowable.find((p) => p.id === id) ?? null).filter((p): p is NonNullable<typeof p> => Boolean(p));
  // retired: used before, so kept for the print history, but no longer offered
  const isRetired = (t: { name: string }) => t.name.startsWith("(retired)");
  const retired = (data ?? []).filter(isRetired);
  const shown = (data ?? []).filter((t) => showRetired === isRetired(t));
  // folders (Print → Templates, or the design connector's organize_templates), A–Z
  const folderOf = (t: (typeof shown)[number]) => (t as { folder?: string | null }).folder ?? null;
  const folders = [...new Set((data ?? []).map(folderOf).filter((f): f is string => Boolean(f)))].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  const groups = [...folders.map((f) => ({ folder: f as string | null, list: shown.filter((t) => folderOf(t) === f) })), { folder: null as string | null, list: shown.filter((t) => !folderOf(t)) }].filter((g) => g.list.length);
  const card = (t: (typeof shown)[number]) => {
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!forCampers(t) && <Badge variant="primary">Staff tag</Badge>}
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
                      <span className="ml-auto">
                        <MoveToFolder templateId={t.id} folder={folderOf(t)} folders={folders} />
                      </span>
                    </div>
                  </li>
                );
              };
  return (
    <div>
      <PageHeader
        title={showRetired ? "Retired templates" : "Templates"}
        description={
          showRetired ? "No longer offered for printing; kept so past print jobs still open." : "The designs for name tags, luggage tags and anything else printed per camper, and staff tags (printed from Staff tags). Put them in folders with Move, at the bottom of each."
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
      {/* folders A–Z (open), then the templates in none; staff tags marked */}
      <div className="space-y-4">
        {groups.map((g) => (
          <details key={g.folder ?? "none"} open className="group rounded-xl border bg-muted/20 p-3 sm:p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              {g.folder ? <FolderOpen className="size-4 text-primary" /> : <FolderMinus className="size-4 text-muted-foreground" />}
              <h2 className="font-semibold" dir="auto">
                {g.folder ?? (groups.length > 1 ? "Not in a folder" : "Templates")}
              </h2>
              <span className="text-sm text-muted-foreground">({g.list.length})</span>
              {g.folder && (
                <span className="ml-auto">
                  <RenameFolder folder={g.folder} />
                </span>
              )}
            </summary>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">{g.list.map(card)}</ul>
          </details>
        ))}
      </div>
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
          {/* the connector is for everyone now: on its own page */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-sm shadow-[var(--shadow-card)]">
            <Sparkles className="size-4 text-muted-foreground" />
            <span className="min-w-0 flex-1">Design templates with Claude: it previews every change as it prints and checks that every name fits.</span>
            <Link href="/connect" className="font-medium text-primary hover:underline">
              Connect your AI
            </Link>
          </div>
          <FontsBox fonts={fonts.map((f) => ({ id: f.id, name: f.name, family: customFamily(f.id), files: f.files.map(({ weight, italic }) => ({ weight, italic })) }))} />
          {isAdmin(user) && <DesignersBox designers={designers} staff={allowable} />}
        </div>
      )}
    </div>
  );
}
