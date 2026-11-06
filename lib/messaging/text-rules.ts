import type { StaffRole } from "@/lib/auth/permissions";

/**
 * Who may text staff, and whom: set per role on Staff → Roles (settings "text_rules"). A role
 * that may text reaches only these roles (null: any role), and as always only the staff of its
 * own divisions unless it looks after all of camp. Owners text anyone. Not set: directors,
 * division heads, klolis and head counselors text, any role (as before the setting).
 */
export const TEXT_RULES_KEY = "text_rules";
export type TextRule = { can: boolean; roles: StaffRole[] | null };
export const DEFAULT_TEXTERS: StaffRole[] = ["director", "division_head", "head_kloli", "kloli", "head_counselor"];

export function textRuleFor(value: unknown, role: StaffRole): TextRule {
  if (role === "owner") return { can: true, roles: null };
  const saved = (value && typeof value === "object" ? (value as Record<string, unknown>)[role] : null) as { can?: unknown; roles?: unknown } | null;
  if (!saved || typeof saved !== "object") return { can: DEFAULT_TEXTERS.includes(role), roles: null };
  const roles = Array.isArray(saved.roles) ? (saved.roles.filter((r) => typeof r === "string") as StaffRole[]) : null;
  return { can: Boolean(saved.can), roles: roles && roles.length ? roles : null };
}

/** The roles a text may go to, given the rule and what was picked (null: every role). Never wider than the rule. */
export function allowedTextRoles(rule: TextRule, picked: string[] | null): string[] | null {
  if (!rule.roles) return picked;
  if (!picked) return rule.roles;
  return picked.filter((r) => rule.roles!.includes(r as StaffRole));
}
