import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSession } from "@/lib/auth/current-user";
import { ACCESS_LEVELS, FIELD_GROUPS, ROLE_ORDER, STAFF_ROLES } from "@/lib/labels";
import { loadRoles } from "@/lib/data/roles";
import { extraGroupOf, loadExtraFields, loadHiddenColumns } from "@/lib/data/extra-fields";
import { groupOfKey } from "@/lib/fields";
import { parseProtected, PROTECTABLE_FIELDS } from "@/lib/import/protected";
import { DEFAULT_RULES, cutoffLabel, type MissingRules } from "@/lib/attendance/missing";
import { presetById } from "@/lib/print/presets";
import { loadDesigners } from "@/lib/print/designers";

const kindName = (g: string) => (g === "basic" ? "everyone who sees the camper" : (FIELD_GROUPS[g]?.label ?? g));
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim() || "—";

/**
 * "How it's set up now": this camp's actual settings, read live (the guide describes how
 * things work; these are the choices made here, which people change): each role's level and
 * what it sees, the added columns and who sees each, the templates, divisions, settings.
 * Markdown, for the Help page and the connector's kinus_guide("now").
 */
export async function liveSetup(): Promise<string> {
  const admin = createAdminClient();
  const session = await getActiveSession();
  const [roles, { data: people }, extra, hidden, { data: templates }, { data: settingsRows }, designers] = await Promise.all([
    loadRoles(admin),
    admin.from("profiles").select("role, login").eq("is_active", true),
    loadExtraFields(),
    loadHiddenColumns(),
    admin.from("print_templates").select("*").not("name", "like", "(retired)%").order("sort_order").order("name"),
    admin.from("settings").select("key, value").in("key", ["office_email", "missing_rules", "protected_columns", "import"]),
    loadDesigners(),
  ]);
  const setting = (k: string) => settingsRows?.find((r) => r.key === k)?.value;
  const [{ data: divisions }, { data: groups }, { data: bunks }] = session
    ? await Promise.all([
        admin.from("divisions").select("id, name, language, group_id, sort_order").eq("session_id", session.id).order("sort_order"),
        admin.from("division_groups").select("id, name").eq("session_id", session.id),
        admin.from("bunks").select("division_id, divisions!inner(session_id)").eq("divisions.session_id", session.id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const out: string[] = [];
  out.push(`Read live from Kinus just now${session ? `, for the session **${session.name}**` : ""}. These are the choices made here (they change when someone changes them); the rest of the guide says how things work.`);

  // roles
  const inUse = ROLE_ORDER.filter((r) => roles.inUse[r]);
  out.push(`### Roles and what each can do and see\nSet on **Setup → Roles** (applies to everyone with the role at once).\n\n| Role | Level | Sees | Active people |\n|---|---|---|---|`);
  for (const r of inUse) {
    const n = (people ?? []).filter((p) => p.role === r && p.login !== "shared").length;
    const sees = r === "owner" ? "everything" : roles.sees[r].map((g) => FIELD_GROUPS[g]?.short ?? g).join(", ") || "no contact or medical details";
    out.push(`| ${STAFF_ROLES[r].label} | ${ACCESS_LEVELS[roles.levels[r]].label} | ${cell(sees)} | ${n} |`);
  }
  const removed = ROLE_ORDER.filter((r) => !roles.inUse[r]).map((r) => STAFF_ROLES[r].label);
  if (removed.length) out.push(`\nRemoved roles (not offered): ${removed.join(", ")}.`);
  out.push(`\nWho may edit templates: directors over all of camp${designers.length ? ` and ${designers.length} ${designers.length === 1 ? "other person" : "other people"} allowed on Print → Templates` : ""}.`);

  // kinds of detail
  out.push(`### Who sees each kind of detail\n| Kind | Roles that see it |\n|---|---|`);
  for (const g of Object.keys(FIELD_GROUPS)) {
    const who = inUse.filter((r) => r !== "owner" && roles.sees[r].includes(g)).map((r) => STAFF_ROLES[r].label);
    out.push(`| ${FIELD_GROUPS[g].label} | Owners${who.length ? `, ${who.join(", ")}` : " only"} |`);
  }

  // added columns
  out.push(`### Added columns (from the export, or a file of extra details)\nSet in **Settings → Extra fields** (names, Show, who sees each, short answers, Hide) and **Setup → Roles**.\n\n| Name | Column | Who sees it | Short answers | Hidden answers |\n|---|---|---|---|---|`);
  for (const f of extra.slice(0, 200)) {
    const g = extraGroupOf(f);
    const how = f.group ? kindName(g) : `${kindName(groupOfKey(`source.${f.column}`))} (guessed from the name)`;
    out.push(`| ${cell(f.label)} | \`${cell(f.column)}\` | ${cell(how)} | ${Object.values(f.answers ?? {}).filter(Boolean).length || "—"} | ${f.hide?.length ? cell(f.hide.join(", ")) : "—"} |`);
  }
  if (extra.length > 200) out.push(`\n…and ${extra.length - 200} more.`);
  if (hidden.length) out.push(`\nLeft out (not shown anywhere): ${hidden.length} ${hidden.length === 1 ? "column" : "columns"}: ${hidden.slice(0, 40).map((h) => `\`${h}\``).join(", ")}${hidden.length > 40 ? "…" : ""}.`);

  // templates
  out.push(`### Templates\nOn **Print → Templates** (they change there).\n\n| Folder | Template | For | Size | Paper | Camps | Copies | At check-in |\n|---|---|---|---|---|---|---|---|`);
  for (const t of templates ?? []) {
    const sheet = t.sheet_layout as { preset?: string; cols?: number; rows?: number } | null;
    const paper = sheet ? (presetById(sheet.preset)?.name ?? `${sheet.cols} × ${sheet.rows} sheet`) : (t as { thermal?: boolean }).thermal ? "thermal label printer, one a page" : "one a page";
    const camps = ((t as { camps?: string[] }).camps ?? []).join(", ") || "all";
    const who = (t as { audience?: string }).audience === "staff" ? "staff" : "campers";
    const checkin = t.auto_on_first_checkin ? "prints by itself" : t.show_on_card ? "button" : "—";
    out.push(`| ${cell((t as { folder?: string | null }).folder ?? "—")} | ${cell(t.name)} | ${who} | ${Number(t.page_width_mm)} × ${Number(t.page_height_mm)} mm${(t as { back?: unknown }).back ? ", two-sided" : ""} | ${cell(paper)} | ${cell(camps)} | ${Number((t as { copies?: number }).copies) || 1} | ${checkin} |`);
  }

  // divisions
  if (divisions?.length) {
    const campOf = new Map((groups ?? []).map((g) => [g.id, g.name]));
    out.push(`### Divisions\nOn **Setup → Divisions & bunks**.\n\n| Division | Camp | Language | Bunks |\n|---|---|---|---|`);
    for (const d of divisions) out.push(`| ${cell(d.name)} | ${cell(d.group_id ? campOf.get(d.group_id) : "—")} | ${{ en: "English", he: "Hebrew", fr: "French" }[d.language as string] ?? d.language} | ${(bunks ?? []).filter((b) => b.division_id === d.id).length} |`);
  }

  // settings
  const office = (setting("office_email") ?? {}) as { to?: string; cc?: string[] };
  const rules = { ...DEFAULT_RULES, ...((setting("missing_rules") ?? {}) as Partial<MissingRules>) };
  const guarded = parseProtected(setting("protected_columns"));
  const fieldName = (k: string) => PROTECTABLE_FIELDS.find((f) => f.field === k)?.label ?? k;
  const threshold = (setting("import") as { missingThresholdPct?: number } | undefined)?.missingThresholdPct ?? 20;
  out.push(`### Settings\nOn **Settings**.\n`);
  out.push(`- **Office email**: ${office.to ? `${office.to}${office.cc?.length ? ` (copy to ${office.cc.join(", ")})` : ""}` : "not set: requests wait in the print queue"}. Asking for labels from a camper's card emails them only when "Email it to the office as a PDF" is ticked (off by default).`);
  out.push(`- **Campers who haven't arrived** are flagged "check up" once ${rules.percent ? `${rules.percent}% of their division is here` : "(percentage off)"}${rules.after_time || rules.after_date ? `, or after ${cutoffLabel(rules)} camp time` : ""}${rules.overrides?.length ? ` (${rules.overrides.length} camp or division ${rules.overrides.length === 1 ? "rule" : "rules"} of their own)` : ""}.`);
  out.push(`- **Protected columns** (change only from our corrected copy): ${[...guarded.fields.map(fieldName), ...guarded.columns.map((c) => `\`${c}\``)].join(", ") || "none"}.`);
  out.push(`- **A partial export**: an import that would mark more than ${threshold}% of a division missing warns first.`);
  return out.join("\n");
}
