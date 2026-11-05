/**
 * Camps that get name tags only (Settings → Camps that get name tags only): no luggage tags,
 * packing labels, buzzers or other printing, no buzzer numbers, and their bunks don't move the
 * continuing bunk numbers. Kept by camp name, so it carries over to next session's camps.
 */
export const NAME_TAGS_ONLY_KEY = "name_tag_only_camps";

/** Not set yet: the Thursday Program's camps and Virtual, as they were handled before the setting. */
export const defaultNameTagsOnly = (camp: string) => /^(thursday|virtual)\b/i.test(camp.trim());

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The saved camp names, or null when never saved (the default applies). */
export function savedNameTagsOnly(value: unknown): string[] | null {
  const camps = (value as { camps?: unknown } | null)?.camps;
  return Array.isArray(camps) ? camps.filter((c): c is string => typeof c === "string" && c.trim() !== "") : null;
}

/** Whether a camp (by name) gets name tags only, given the saved setting's value. */
export function nameTagsOnlyRule(value: unknown): (camp: string) => boolean {
  const saved = savedNameTagsOnly(value);
  return saved ? (camp) => saved.some((c) => same(c, camp)) : defaultNameTagsOnly;
}

/** Whether a template is name-tag printing (still printed for those camps). */
export const isNameTag = (t: unknown) => (t as { kind?: string } | null)?.kind === "name_tag";
