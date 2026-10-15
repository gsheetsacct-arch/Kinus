"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Delete, Save, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveNameFixes } from "@/app/(app)/print/names/actions";
import { convertTyped, hasEnglish, isHebrew, lettersSpelledOut } from "@/lib/hebrew-names";
import { cn, plural } from "@/lib/utils";

export type NameRow = {
  camperId: string;
  name: string;
  where: string;
  divisionName: string | null;
  divisionColor: string | null;
  column: string;
  columnLabel: string;
  kind: "first" | "last";
  /** What the registration says. */
  registration: string;
  fix: { value: string; was: string } | null;
  state: "english" | "empty" | "fixed";
  suggestion: { value: string; how: string } | null;
  canFix: boolean;
};

type Draft = { value: string; use: boolean };
const keyOf = (r: NameRow) => `${r.camperId}|${r.column}`;
const LETTERS = "אבגדהוזחטיכלמנסעפצקרשת".split("");
const FINALS = ["ך", "ם", "ן", "ף", "ץ"];

/**
 * Hebrew names to fix: each with a suggestion filled in (from the letters spelled out,
 * from campers already in Hebrew, or the list of common names), to check and save
 * together. Typing letter names ("nun shin") turns them into letters; the letter pad
 * types Hebrew without a Hebrew keyboard.
 */
export function NameFixer({ rows }: { rows: NameRow[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<NameRow["state"]>(rows.some((r) => r.state === "english") ? "english" : rows.some((r) => r.state === "empty") ? "empty" : "fixed");
  const [division, setDivision] = React.useState("");
  const [q, setQ] = React.useState("");
  const [onlySuggested, setOnlySuggested] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  // what's typed in each row (rows keep their own state; this is read on save)
  const drafts = React.useRef(new Map<string, Draft>());
  const setters = React.useRef(new Map<string, (v: string) => void>());
  const [count, setCount] = React.useState(0);
  const recount = React.useCallback(() => setCount([...drafts.current.values()].filter((d) => d.use && d.value.trim()).length), []);
  const [focused, setFocused] = React.useState<{ key: string; el: HTMLInputElement } | null>(null);

  const counts = { english: 0, empty: 0, fixed: 0 };
  for (const r of rows) counts[r.state]++;
  const divisions = [...new Set(rows.map((r) => r.divisionName ?? "No division"))];
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      r.state === tab &&
      (!division || (r.divisionName ?? "No division") === division) &&
      (!needle || `${r.name} ${r.registration} ${r.fix?.value ?? ""}`.toLowerCase().includes(needle)) &&
      (!onlySuggested || r.suggestion),
  );
  const limit = 300;

  const save = (items: { camperId: string; column: string; value: string }[]) =>
    startTransition(async () => {
      if (!items.length) return void toast.message("Nothing to save: type or keep a name first.");
      const bad = items.filter((i) => i.value && hasEnglish(i.value));
      if (bad.length && !confirm(`${plural(bad.length, "name")} still has English letters (${bad[0].value}). Save anyway?`)) return;
      const r = await saveNameFixes(items).catch(() => ({ ok: false as const, error: "Couldn't save: check the connection and try again." }));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      for (const i of items) drafts.current.delete(`${i.camperId}|${i.column}`);
      recount();
      router.refresh();
    });
  const saveAll = () =>
    save(
      shown
        .filter((r) => r.canFix)
        .flatMap((r) => {
          const d = drafts.current.get(keyOf(r));
          const value = convertTyped(d?.value ?? "").trim();
          return d?.use && value && value !== r.fix?.value ? [{ camperId: r.camperId, column: r.column, value }] : [];
        }),
    );
  const shownCount = shown.filter((r) => {
    const d = drafts.current.get(keyOf(r));
    return r.canFix && d?.use && d.value.trim() && d.value.trim() !== r.fix?.value;
  }).length;

  // the letter pad types into the box that has the cursor
  const type = (text: string | null) => {
    if (!focused) return;
    const el = focused.el;
    const [a, b] = [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length];
    const next = text === null ? (a === b ? el.value.slice(0, Math.max(0, a - 1)) + el.value.slice(b) : el.value.slice(0, a) + el.value.slice(b)) : el.value.slice(0, a) + text + el.value.slice(b);
    const at = text === null ? (a === b ? Math.max(0, a - 1) : a) : a + text.length;
    setters.current.get(focused.key)?.(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at, at);
    });
  };

  return (
    <div className="space-y-4 pb-28">
      <div className="inline-flex w-full flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-auto">
        {(
          [
            ["english", "In English"],
            ["empty", "Empty"],
            ["fixed", "Fixed"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            aria-pressed={tab === v}
            className={cn("flex-1 rounded-md px-3 py-1.5 text-sm sm:flex-none", tab === v ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
          >
            {label} <span className="text-xs text-muted-foreground">{counts[v]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a camper" className="pl-8" />
        </div>
        {divisions.length > 1 && (
          <Select value={division} onChange={(e) => setDivision(e.target.value)} className="w-auto">
            <option value="">All divisions</option>
            {divisions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        )}
        {tab !== "fixed" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlySuggested} onChange={(e) => setOnlySuggested(e.target.checked)} className="size-4" />
            Only ones with a suggestion
          </label>
        )}
      </div>

      {tab !== "fixed" && (
        <p className="text-sm text-muted-foreground">
          Each one has a suggestion filled in where Kinus has one: check it, change it if needed, untick any you&apos;re not sure of, then save them together. Type letter names
          (<span className="whitespace-nowrap">nun shin beis tes</span>; a comma between words) and they turn into Hebrew letters.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{tab === "fixed" ? "No fixes yet." : "Nothing here: every name in this list is in Hebrew."}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y">
            {shown.slice(0, limit).map((r) => (
              <Row
                key={`${keyOf(r)}|${r.state}|${r.fix?.value ?? ""}`}
                row={r}
                drafts={drafts.current}
                setters={setters.current}
                onChange={recount}
                onFocus={(el) => setFocused({ key: keyOf(r), el })}
                onTakeBack={() => save([{ camperId: r.camperId, column: r.column, value: "" }])}
                busy={pending}
              />
            ))}
          </ul>
          {shown.length > limit && <p className="border-t p-3 text-center text-sm text-muted-foreground">Showing the first {limit} of {shown.length}: save these, or narrow by division.</p>}
        </div>
      )}

      {/* the save bar and the letter pad stay at the bottom of the screen */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-[0_-2px_8px_rgba(0,0,0,.06)] backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2">
          {focused && (
            <div className="flex flex-wrap justify-center gap-1" dir="rtl" aria-label="Hebrew letters">
              {[...LETTERS, ...FINALS].map((ch) => (
                <button key={ch} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => type(ch)} className="h-9 min-w-9 rounded-md border bg-card px-2 text-lg leading-none hover:bg-muted">
                  {ch}
                </button>
              ))}
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => type(" ")} className="h-9 rounded-md border bg-card px-4 text-xs text-muted-foreground hover:bg-muted">
                space
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => type(null)} className="h-9 rounded-md border bg-card px-3 hover:bg-muted" aria-label="Delete a letter">
                <Delete className="size-4" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{tab === "fixed" ? "Change a fix and save, or take it back." : `${plural(shownCount, "name")} ready to save${count > shownCount ? ` (${count} in all)` : ""}`}</span>
            <Button onClick={saveAll} disabled={pending || shownCount === 0}>
              <Save /> {pending ? "Saving…" : `Save ${shownCount || ""} ${shownCount === 1 ? "fix" : "fixes"}`.replace("  ", " ")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const Row = React.memo(function Row({
  row: r,
  drafts,
  setters,
  onChange,
  onFocus,
  onTakeBack,
  busy,
}: {
  row: NameRow;
  drafts: Map<string, Draft>;
  setters: Map<string, (v: string) => void>;
  onChange: () => void;
  onFocus: (el: HTMLInputElement) => void;
  onTakeBack: () => void;
  busy: boolean;
}) {
  const key = keyOf(r);
  const start = drafts.get(key) ?? { value: r.fix?.value ?? r.suggestion?.value ?? "", use: r.state === "fixed" ? false : Boolean(r.suggestion) };
  const [value, setValue] = React.useState(start.value);
  const [use, setUse] = React.useState(start.use);
  const update = React.useCallback(
    (v: string, u?: boolean) => {
      setValue(v);
      const next = { value: v, use: u ?? (v.trim() ? true : false) };
      if (u === undefined) setUse(next.use);
      drafts.set(key, next);
      onChange();
    },
    [drafts, key, onChange],
  );
  React.useEffect(() => {
    if (!drafts.has(key)) drafts.set(key, start);
    setters.set(key, (v) => update(v));
    return () => void setters.delete(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, update]);
  React.useEffect(() => onChange(), [onChange]);
  const spelled = lettersSpelledOut(value);
  const changed = r.fix && r.fix.was.trim() !== r.registration.trim();
  return (
    <li className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <span className="size-2 shrink-0 rounded-full" style={{ background: r.divisionColor ?? "var(--muted-foreground)" }} />
          <span dir="auto" className="truncate">{r.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {r.columnLabel}
          {r.where && ` · ${r.where}`}
        </p>
      </div>
      <div className="min-w-0 text-sm">
        <span className="text-xs text-muted-foreground">Registration says </span>
        <span dir="auto" className={cn("break-words", !r.registration && "italic text-muted-foreground")}>{r.registration || "nothing"}</span>
        {changed && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Changed since the fix (it said <span dir="auto">{r.fix!.was || "nothing"}</span>)
          </p>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {r.state !== "fixed" && (
            <input
              type="checkbox"
              aria-label={`Save the fix for ${r.name}`}
              checked={use}
              disabled={!r.canFix}
              onChange={(e) => {
                setUse(e.target.checked);
                drafts.set(key, { value, use: e.target.checked });
                onChange();
              }}
              className="size-4 shrink-0"
            />
          )}
          <Input
            dir="rtl"
            lang="he"
            value={value}
            disabled={!r.canFix}
            placeholder="בעברית"
            onFocus={(e) => onFocus(e.currentTarget)}
            onChange={(e) => update(e.target.value)}
            onBlur={() => spelled && update(spelled)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (spelled) update(spelled);
              // on to the next name
              const all = [...document.querySelectorAll<HTMLInputElement>("input[lang=he]:not([disabled])")];
              all[all.indexOf(e.currentTarget) + 1]?.focus();
            }}
            className={cn("h-9 text-base", value && !isHebrew(value) && !spelled && "border-amber-400")}
          />
          {r.state === "fixed" && (
            <Button size="sm" variant="ghost" className="shrink-0" disabled={busy || !r.canFix} onClick={onTakeBack} title="Use what the registration says again">
              <Undo2 /> Take back
            </Button>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {spelled ? (
            <>
              <Check className="inline size-3" /> becomes <span dir="rtl">{spelled}</span>
            </>
          ) : r.state !== "fixed" && r.suggestion && value === r.suggestion.value ? (
            `Suggested: ${r.suggestion.how}`
          ) : r.state !== "fixed" && !r.suggestion && !value ? (
            "No suggestion: type it, or letter names"
          ) : (
            " "
          )}
        </p>
      </div>
    </li>
  );
});
