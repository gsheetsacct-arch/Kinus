import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { seesAllCamp, type CurrentUser } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { STAFF_ROLES } from "@/lib/labels";
import { shownEmail } from "@/lib/staff/login-kinds";
import { backgroundDataUrl, imageDataUrls } from "./data";
import { renderDocument } from "./render";
import { customFontCss } from "./custom-fonts";
import { staffValues, type StaffPerson } from "./staff-values";
import type { TemplateSpec } from "./types";

export type StaffToPrint = { id: string; name: string; role: string; title: string | null; divisionIds: string[]; values: Record<string, string> };

const roleLabel = (r: string) => STAFF_ROLES[r as keyof typeof STAFF_ROLES]?.label ?? r;

/**
 * The staff this person may print tags for, with each one's values: everyone for directors
 * and the office over all of camp, otherwise the staff of their own divisions. Check-in logins
 * (phones, not people) are left out.
 */
export async function staffInView(me: CurrentUser): Promise<StaffToPrint[]> {
  const admin = createAdminClient();
  const { data: session } = await admin.from("sessions").select("id").eq("is_active", true).maybeSingle();
  const [tree, { data: people }, { data: scopes }, reg] = await Promise.all([
    loadAreaTree(admin, session?.id),
    admin.from("profiles").select("id, full_name, role, title, phone, email, all_areas").eq("is_active", true).neq("login", "shared").order("full_name"),
    admin.from("staff_scopes").select("user_id, group_id, division_id, bunk_id"),
    // registration details (migration 0040): read on their own, so tags print before it's applied
    admin.from("profiles").select("id, source_id, details").then((r) => r.data ?? [], () => []),
  ]);
  const regOf = new Map(reg.map((r) => [r.id, r]));
  const camp = new Map(tree.groups.map((g) => [g.id, g.name]));
  const division = new Map(tree.divisions.map((d) => [d.id, d]));
  const bunk = new Map(tree.divisions.flatMap((d) => d.bunks.map((b) => [b.id, b.name] as const)));
  const mine = new Set(me.coverage.map((c) => c.division_id));
  const out: StaffToPrint[] = [];
  for (const p of people ?? []) {
    const places: StaffPerson["places"] = [];
    const divisionIds: string[] = [];
    for (const s of (scopes ?? []).filter((x) => x.user_id === p.id)) {
      const ds = s.group_id ? tree.divisions.filter((d) => d.group_id === s.group_id) : s.division_id && division.has(s.division_id) ? [division.get(s.division_id)!] : [];
      for (const d of ds) {
        divisionIds.push(d.id);
        places.push({ division: d.name, color: d.color, camp: d.group_id ? (camp.get(d.group_id) ?? null) : null, bunk: s.bunk_id ? (bunk.get(s.bunk_id) ?? null) : null });
      }
    }
    if (!seesAllCamp(me) && (p.all_areas || p.role === "owner" || !divisionIds.some((d) => mine.has(d)))) continue;
    const r = regOf.get(p.id) as { source_id?: string | null; details?: unknown } | undefined;
    const person: StaffPerson = {
      name: p.full_name,
      role: p.role,
      title: p.title,
      phone: p.phone,
      email: shownEmail(p.email),
      sourceId: r?.source_id ?? null,
      details: (r?.details as Record<string, string> | null) ?? null,
      places,
    };
    out.push({ id: p.id, name: p.full_name, role: p.role, title: p.title, divisionIds: [...new Set(divisionIds)], values: staffValues(person, roleLabel) });
  }
  return out;
}

/** Staff tags as one printable page (the browser prints it): the template filled for each person. */
export async function staffSheetHtml(spec: TemplateSpec, items: { values: Record<string, string>; copies: number }[]): Promise<string> {
  const admin = createAdminClient();
  const [background, images, fontCss] = await Promise.all([backgroundDataUrl(admin, spec.background_path), imageDataUrls(admin, spec.layers), customFontCss(spec)]);
  return renderDocument(spec, items, { background, images, fontCss });
}
