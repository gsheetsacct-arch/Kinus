import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth/permissions";
import { visibleDivisionIds } from "@/lib/auth/permissions";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { extraValue } from "@/lib/import/extra-fields";
import { fixKey, parseFixes, withFixes } from "@/lib/source-fixes";
import { hasEnglish, isHebrew, NameBook, suggestHebrew, type SuggestionSource } from "@/lib/hebrew-names";
import { canFixNamesFor, hebrewNameColumns, type NameColumn } from "@/lib/print/name-columns";
import { byBunkThenName } from "@/lib/print/data";
import { plural } from "@/lib/utils";

/**
 * The Hebrew names to look at (Print → Hebrew names, and the design connector's
 * list_hebrew_names / fix_hebrew_names): each camper's Hebrew-name columns typed in English,
 * spelled out, empty or already fixed, with a suggestion; and saving fixes.
 */

export type NameRow = {
  camperId: string;
  name: string;
  where: string;
  divisionName: string | null;
  divisionColor: string | null;
  column: string;
  columnLabel: string;
  kind: "first" | "last" | "full";
  /** What the registration says. */
  registration: string;
  fix: { value: string; was: string } | null;
  /** null: in Hebrew already (only listed when asked for everyone). */
  state: "english" | "empty" | "fixed" | null;
  suggestion: { value: string; how: string; source: SuggestionSource } | null;
  canFix: boolean;
};

export type NameReview = { columns: NameColumn[]; rows: NameRow[]; migrated: boolean };

/**
 * Every Hebrew-name cell of the active session's campers the person sees (within divisionIds
 * when given, e.g. the camp picked); with everyone: true, also the ones already in Hebrew.
 */
export async function hebrewNameReview(user: CurrentUser, sessionId: string, opts: { divisionIds?: string[] | null; everyone?: boolean; db?: SupabaseClient<Database> } = {}): Promise<NameReview> {
  const admin = opts.db ?? createAdminClient();
  const named = await hebrewNameColumns(admin);
  if (!named.length) return { columns: [], rows: [], migrated: true };
  const allowed = visibleDivisionIds(user);
  // "*": the staff fixes too (works before migration 0034, without them)
  const campers = await fetchAll((from, to) => {
    let q = admin.from("campers").select("*, divisions(name, color), bunks(name)").eq("session_id", sessionId).is("archived_at", null);
    if (opts.divisionIds) q = q.in("division_id", opts.divisionIds);
    if (allowed) q = q.in("division_id", allowed);
    return q.order("id").range(from, to);
  });
  const migrated = campers.length === 0 || "source_fixes" in campers[0];
  const list = campers
    .map((c) => {
      const d = c.divisions as { name: string; color: string | null } | null;
      const b = c.bunks as { name: string } | null;
      return { ...c, division_name: d?.name ?? null, division_color: d?.color ?? null, bunk_name: b?.name ?? null, fixes: parseFixes((c as { source_fixes?: unknown }).source_fixes) };
    })
    .sort(byBunkThenName);
  // a field reading a column this export doesn't have (or nobody filled in) would list every
  // camper as missing it: those columns aren't shown
  const columns = named.filter((col) => list.some((c) => extraValue(withFixes(c.source_data, c.fixes), col.column)));
  // the English a Hebrew-name column is compared with: a full name is the first and last name
  const englishOf = (c: (typeof list)[number], kind: "first" | "last" | "full") => (kind === "first" ? c.first_name : kind === "last" ? c.last_name : `${c.first_name} ${c.last_name}`);
  // what's already in Hebrew teaches the suggestions (siblings' last name, others with the same first name);
  // full names learn from the first and last names too, word by word
  const books = { first: new NameBook(), last: new NameBook(), full: new NameBook() };
  for (const c of list) {
    const row = withFixes(c.source_data, c.fixes);
    for (const col of columns) {
      books[col.kind].learn(englishOf(c, col.kind), extraValue(row, col.column));
      if (col.kind !== "full") books.full.learn(englishOf(c, col.kind), extraValue(row, col.column));
    }
  }
  const rows: NameRow[] = [];
  for (const c of list) {
    for (const col of columns) {
      const registration = extraValue(c.source_data, col.column);
      const fix = c.fixes[fixKey(col.column)] ?? null;
      const now = fix ? fix.value : registration;
      const state = fix ? "fixed" : !now ? "empty" : hasEnglish(now) ? "english" : isHebrew(now) ? null : "english";
      if (!state && !opts.everyone) continue;
      const english = englishOf(c, col.kind);
      rows.push({
        camperId: c.id,
        name: `${c.first_name} ${c.last_name}`,
        where: [c.division_name, c.bunk_name].filter(Boolean).join(" · "),
        divisionName: c.division_name,
        divisionColor: c.division_color,
        column: col.column,
        columnLabel: col.label,
        kind: col.kind,
        registration,
        fix: fix ? { value: fix.value, was: fix.was ?? "" } : null,
        state,
        suggestion: state === "fixed" || !state ? null : suggestHebrew(registration, english, books[col.kind]),
        canFix: canFixNamesFor(user, c),
      });
    }
  }
  return { columns, rows, migrated };
}

export type NameFix = { camperId: string; column: string; value: string };

/**
 * Saves fixes to Hebrew-name columns (value "" takes a fix back). Each remembers what the
 * registration said, so next session's import carries it over only while it still applies.
 * Throws a message for the person when something isn't allowed.
 */
export async function saveHebrewNameFixes(user: CurrentUser, items: NameFix[]): Promise<string> {
  const admin = createAdminClient();
  // only the Hebrew-name columns, never any other export column
  const columns = new Set((await hebrewNameColumns(admin)).map((c) => fixKey(c.column)));
  if (items.some((i) => !columns.has(fixKey(i.column)))) throw new Error("That column isn't one of the Hebrew-name columns.");
  const ids = [...new Set(items.map((i) => i.camperId))];
  const rows: { id: string; division_id: string | null; bunk_id: string | null; source_data: unknown; source_fixes?: unknown }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin.from("campers").select("*").in("id", ids.slice(i, i + 150));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  if (rows.length < ids.length) throw new Error("Some of those campers aren't in Kinus (check the camper ids).");
  if (rows.length && !rows.some((r) => "source_fixes" in r)) throw new Error("Name fixes need the latest database update (migration 0034). Run it, then try again.");
  for (const r of rows) if (!canFixNamesFor(user, r)) throw new Error("You can only fix names of campers in your own part of camp.");
  const at = new Date().toISOString();
  const updates = rows.map((r) => {
    const fixes = parseFixes(r.source_fixes);
    for (const it of items.filter((i) => i.camperId === r.id)) {
      const key = fixKey(it.column);
      if (!it.value) delete fixes[key];
      else fixes[key] = { value: it.value, was: extraValue(r.source_data, it.column), by: user.id, at };
    }
    return { id: r.id, fixes };
  });
  for (let i = 0; i < updates.length; i += 25) {
    const done = await Promise.all(updates.slice(i, i + 25).map((u) => admin.from("campers").update({ source_fixes: u.fixes } as never).eq("id", u.id)));
    for (const { error } of done) if (error) throw error;
  }
  const saved = items.filter((i) => i.value).length;
  const undone = items.length - saved;
  return [saved && `Saved ${plural(saved, "fix", "fixes")}.`, undone && `Took back ${plural(undone, "fix", "fixes")}.`].filter(Boolean).join(" ") + " New uploads keep them.";
}
