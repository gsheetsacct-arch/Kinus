"use client";
import * as React from "react";
import { Select } from "@/components/ui/select";
import { encodeScope, type BoardScope } from "@/lib/attendance/board";

export type ScopeTree = { groups: { id: string; name: string }[]; divisions: { id: string; name: string; group_id: string | null; bunks: { id: string; name: string }[] }[] };

/** Whole camp, a camp, a division or a bunk; only places that have campers this person sees. */
export function ScopeSelect({
  value,
  onChange,
  rows,
  tree,
  campLabel,
}: {
  value: BoardScope;
  onChange: (encoded: string) => void;
  rows: { divisionId: string | null; bunkId: string | null }[];
  tree: ScopeTree;
  campLabel: string;
}) {
  const has = React.useMemo(() => ({ d: new Set(rows.map((r) => r.divisionId)), b: new Set(rows.map((r) => r.bunkId)) }), [rows]);
  const divisions = tree.divisions.filter((d) => has.d.has(d.id));
  const camps = tree.groups.filter((g) => divisions.some((d) => d.group_id === g.id));
  return (
    <Select value={encodeScope(value)} onChange={(e) => onChange(e.target.value)} aria-label="Show" className="w-auto min-w-56 max-w-full font-medium">
      <option value="all">{campLabel}</option>
      {camps.length > 1 &&
        camps.map((g) => (
          <option key={g.id} value={encodeScope({ kind: "group", id: g.id })}>
            {g.name} camp
          </option>
        ))}
      {divisions.map((d) => (
        <optgroup key={d.id} label={d.name}>
          <option value={encodeScope({ kind: "division", id: d.id })}>All of {d.name}</option>
          {d.bunks
            .filter((b) => has.b.has(b.id))
            .map((b) => (
              <option key={b.id} value={encodeScope({ kind: "bunk", divisionId: d.id, id: b.id })}>
                {b.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** The chosen place, remembered per device and per screen; falls back if it no longer exists. */
export function useScope(storageKey: string, initial: BoardScope, exists: (s: BoardScope) => boolean, decode: (v: string | null) => BoardScope | null) {
  const [scope, setScope] = React.useState<BoardScope>(initial);
  React.useEffect(() => {
    try {
      const s = decode(localStorage.getItem(storageKey));
      if (s && exists(s)) setScope(s);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const choose = React.useCallback(
    (v: string) => {
      setScope(decode(v) ?? { kind: "all" });
      try {
        localStorage.setItem(storageKey, v);
      } catch {}
    },
    [storageKey, decode],
  );
  return [scope, choose] as const;
}
