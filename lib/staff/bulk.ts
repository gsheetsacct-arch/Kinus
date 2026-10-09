import type { AccessLevel, StaffRole } from "@/lib/auth/permissions";
import type { AreaTree, AreaValue } from "@/lib/data/areas";
import { normalizeName } from "@/lib/import/normalize";

export type BulkInputRow = { line: number; name: string; email: string; role: string; where: string; bunk: string; level: string };
export type BulkPlanRow = {
  line: number;
  name: string;
  email: string;
  role: StaffRole | null;
  level: AccessLevel | null;
  allAreas: boolean;
  areas: AreaValue[];
  areaText: string;
  errors: string[];
};

const HEADERS: Record<keyof Omit<BulkInputRow, "line">, string[]> = {
  name: ["name", "full name", "fullname", "staff", "person"],
  email: ["email", "e-mail", "mail", "email address"],
  role: ["role", "position", "job", "title"],
  where: ["division", "group", "where", "area", "divisions"],
  bunk: ["bunk", "bunks", "group/bunk", "cabin"],
  level: ["level", "access", "can"],
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rows from a pasted spreadsheet / CSV grid. Works with or without a header row. */
export function readRows(grid: string[][]): BulkInputRow[] {
  const rows = grid.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c !== ""));
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.toLowerCase());
  const looksLikeHeader = !head.some((c) => EMAIL.test(c)) && head.some((h) => Object.values(HEADERS).some((names) => names.includes(h)));
  const col = (key: keyof typeof HEADERS, fallback: number) => {
    if (!looksLikeHeader) return fallback;
    const i = head.findIndex((h) => HEADERS[key].includes(h));
    return i;
  };
  const idx = { name: col("name", 0), email: col("email", 1), role: col("role", 2), where: col("where", 3), bunk: col("bunk", 4), level: col("level", 5) };
  // without a header, find the email column by content
  if (!looksLikeHeader) {
    const e = rows[0].findIndex((c) => EMAIL.test(c));
    if (e >= 0 && e !== 1) {
      idx.email = e;
      idx.name = e === 0 ? 1 : 0;
    }
  }
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "") : "");
  return rows.slice(looksLikeHeader ? 1 : 0).map((r, i) => ({
    line: i + (looksLikeHeader ? 2 : 1),
    name: at(r, idx.name),
    email: at(r, idx.email).toLowerCase(),
    role: at(r, idx.role),
    where: at(r, idx.where),
    bunk: at(r, idx.bunk),
    level: at(r, idx.level),
  }));
}

const ROLE_WORDS: [StaffRole, string[]][] = [
  ["director", ["director", "admin", "administrator", "camp director", "program director"]],
  ["division_head", ["division head", "head of division", "dh", "division director", "rosh"]],
  ["head_counselor", ["head counselor", "head counsellor", "hc", "head staff", "learning head"]],
  ["counselor", ["counselor", "counsellor", "staff", "madrich", "cabin counselor", "bunk counselor"]],
  ["scanner", ["check-in helper", "check in helper", "helper", "scanner", "volunteer"]],
  ["office", ["office", "secretary", "registration"]],
  ["logistics", ["logistics", "transport", "transportation", "buses"]],
];
export function matchRole(text: string): StaffRole | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  for (const [role, words] of ROLE_WORDS) if (words.includes(t)) return role;
  for (const [role, words] of ROLE_WORDS) if (words.some((w) => t.includes(w) && w.length > 3)) return role;
  return null;
}

export function matchLevel(text: string): AccessLevel | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/edit|change|update/.test(t)) return "edit";
  if (/scan|check|in.?out/.test(t)) return "scan";
  if (/view|read|see/.test(t)) return "view";
  return null;
}

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function suggest(text: string, options: string[]) {
  const n = normalizeName(text);
  const best = options.map((o) => ({ o, d: distance(n, normalizeName(o)) })).sort((x, y) => x.d - y.d)[0];
  return best && best.d <= Math.max(2, Math.floor(n.length / 3)) ? ` Did you mean “${best.o}”?` : "";
}
const split = (s: string) => s.split(/[;,|]/).map((x) => x.trim()).filter(Boolean);
const EVERYWHERE = ["all", "all of camp", "everywhere", "whole camp", "camp", "everything"];

/** Turns "Main camp" / "Division 2" + "Bunk Chof" into areas, or explains what didn't match. */
export function matchAreas(where: string, bunk: string, tree: AreaTree): { allAreas: boolean; areas: AreaValue[]; text: string; errors: string[] } {
  const errors: string[] = [];
  const areas: AreaValue[] = [];
  const names: string[] = [];
  const wheres = split(where);
  const bunks = split(bunk);
  if (wheres.some((w) => EVERYWHERE.includes(w.toLowerCase()))) return { allAreas: true, areas: [], text: "All of camp", errors };
  const divisionsHere: AreaTree["divisions"] = [];
  for (const w of wheres) {
    const g = tree.groups.find((x) => normalizeName(x.name) === normalizeName(w));
    if (g) {
      if (!bunks.length) {
        areas.push({ group_id: g.id, division_id: null, bunk_id: null });
        names.push(g.name);
      }
      divisionsHere.push(...tree.divisions.filter((d) => d.group_id === g.id));
      continue;
    }
    const d = tree.divisions.find((x) => normalizeName(x.name) === normalizeName(w));
    if (d) {
      divisionsHere.push(d);
      if (!bunks.length) {
        areas.push({ group_id: null, division_id: d.id, bunk_id: null });
        names.push(d.name);
      }
      continue;
    }
    errors.push(`No division or group called “${w}”.${suggest(w, [...tree.groups.map((x) => x.name), ...tree.divisions.map((x) => x.name)])}`);
  }
  for (const b of bunks) {
    const pool = divisionsHere.length ? divisionsHere : tree.divisions;
    const hits = pool.flatMap((d) => d.bunks.filter((x) => normalizeName(x.name) === normalizeName(b)).map((x) => ({ d, x })));
    if (hits.length === 1) {
      areas.push({ group_id: null, division_id: hits[0].d.id, bunk_id: hits[0].x.id });
      names.push(`${hits[0].d.name} · ${hits[0].x.name}`);
    } else if (hits.length > 1) {
      errors.push(`“${b}” exists in ${hits.map((h) => h.d.name).join(" and ")}. Add the division.`);
    } else {
      errors.push(`No bunk called “${b}”${divisionsHere.length ? ` in ${divisionsHere.map((d) => d.name).join(", ")}` : ""}.${suggest(b, pool.flatMap((d) => d.bunks.map((x) => x.name)))}`);
    }
  }
  return { allAreas: false, areas, text: names.join(", "), errors };
}

export function planRows(rows: BulkInputRow[], tree: AreaTree, defaults: { role: StaffRole; level: AccessLevel | "role" }): BulkPlanRow[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    const errors: string[] = [];
    if (!r.name) errors.push("Missing name.");
    if (!EMAIL.test(r.email)) errors.push(r.email ? `“${r.email}” isn't an email address.` : "Missing email.");
    else if (seen.has(r.email)) errors.push("This email is listed twice.");
    seen.add(r.email);
    let role: StaffRole | null = defaults.role;
    if (r.role) {
      role = matchRole(r.role);
      if (!role) errors.push(`Unknown role “${r.role}”.`);
    }
    const lvl = r.level ? matchLevel(r.level) : null;
    if (r.level && !lvl) errors.push(`Unknown level “${r.level}”. Use view, check in/out, or edit.`);
    const a = matchAreas(r.where, r.bunk, tree);
    errors.push(...a.errors);
    if (!a.allAreas && !a.areas.length && !a.errors.length && role !== "office" && role !== "logistics") errors.push("Say where they work: a division, group, bunk, or “All”.");
    const level = lvl ?? (defaults.level !== "role" ? defaults.level : null);
    const everywhere = a.allAreas || (!a.areas.length && !a.errors.length && (role === "office" || role === "logistics"));
    return { line: r.line, name: r.name, email: r.email, role, level, allAreas: everywhere, areas: a.areas, areaText: everywhere ? "All of camp" : a.areas.length ? a.text : "—", errors };
  });
}
