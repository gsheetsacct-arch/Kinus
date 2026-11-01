"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera as CameraIcon, CameraOff, Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera } from "@/components/scan/camera";
import { findScanCode } from "@/lib/attendance/scan";
import { STATUS_LABEL } from "@/lib/attendance/machine";
import { byBunkThenName, summarize, type CountCamper, type CountMark } from "@/lib/head-counts";
import { normalizeName } from "@/lib/import/normalize";
import { cn, formatWhen } from "@/lib/utils";
import { closeCount, countState, markCamper, unmarkCamper } from "@/app/(app)/counts/actions";

type Flash = { tone: "ok" | "again" | "bad"; text: string; at: number };
type Tab = "missing" | "counted";

/**
 * Counting kids onto a bus: pick your bus (when there's more than one), scan tags or tap names.
 * The total, each bus's count and who's still missing update for everyone counting, every few
 * seconds. Nothing here changes anyone's check-in.
 */
export function HeadCountBoard({
  countId,
  groups,
  campers,
  initialMarks,
  divisions,
  closed: closedAtLoad,
  canClose,
}: {
  countId: string;
  groups: string[];
  campers: CountCamper[];
  initialMarks: CountMark[];
  divisions: { id: string; name: string }[];
  closed: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const [marks, setMarks] = React.useState(initialMarks);
  const [closed, setClosed] = React.useState(closedAtLoad);
  const [group, setGroup] = React.useState<string | null>(groups.length ? null : "");
  const [camera, setCamera] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<Tab>("missing");
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [flash, setFlash] = React.useState<Flash | null>(null);
  const busy = React.useRef(new Set<string>());

  // the bus this phone counts on, remembered for this count
  const busKey = `kinus:count-bus:${countId}`;
  React.useEffect(() => {
    if (!groups.length) return;
    try {
      const saved = localStorage.getItem(busKey);
      if (saved && groups.includes(saved)) setGroup(saved);
    } catch {}
  }, [busKey, groups]);
  const pickGroup = (g: string) => {
    setGroup(g);
    try {
      localStorage.setItem(busKey, g);
    } catch {}
  };

  // the other buses' counts, every few seconds
  React.useEffect(() => {
    const tick = () =>
      document.visibilityState === "visible" &&
      countState(countId)
        .then((r) => {
          if (r.ok) {
            setMarks(r.marks);
            setClosed(Boolean(r.closed));
          }
        })
        .catch(() => undefined);
    const t = setInterval(tick, 4000);
    return () => clearInterval(t);
  }, [countId]);

  const byCode = React.useMemo(() => new Map(campers.map((c) => [c.code, c])), [campers]);
  const markOf = React.useMemo(() => new Map(marks.map((m) => [m.camperId, m])), [marks]);
  const s = summarize(campers, marks, groups);
  const ready = !closed && group !== null;
  const divName = new Map(divisions.map((d) => [d.id, d.name]));

  const show = (tone: Flash["tone"], text: string) => {
    setFlash({ tone, text, at: Date.now() });
    try {
      navigator.vibrate?.(tone === "ok" ? 60 : [80, 60, 80]);
    } catch {}
  };

  const count = async (c: CountCamper, method: "scan" | "manual") => {
    if (closed) return show("bad", "This count is closed.");
    if (group === null) return show("bad", "Pick your bus first.");
    if (busy.current.has(c.id)) return;
    const before = markOf.get(c.id);
    if (before && (before.group ?? "") === (group ?? "")) return show("again", `${c.name}: already counted${before.group ? ` on ${before.group}` : ""}.`);
    busy.current.add(c.id);
    // counted at once on screen; the server confirms
    setMarks((cur) => [...cur.filter((m) => m.camperId !== c.id), { camperId: c.id, group: group || null, by: null, at: new Date().toISOString(), method }]);
    show("ok", `${c.name}${c.bunk ? ` · ${c.bunk}` : ""}${before?.group ? ` · moved from ${before.group}` : ""}${c.status !== "present" ? ` · ${STATUS_LABEL[c.status].toLowerCase()}, not checked in` : ""}`);
    const r = await markCamper(countId, c.id, group || null, method).catch(() => ({ ok: false as const, error: "Couldn't save that: check the connection and scan again." }));
    busy.current.delete(c.id);
    if (r.ok) setMarks(r.marks);
    else {
      setMarks((cur) => [...cur.filter((m) => m.camperId !== c.id), ...(before ? [before] : [])]);
      show("bad", r.error);
    }
  };

  const uncount = async (c: CountCamper) => {
    const before = markOf.get(c.id);
    setMarks((cur) => cur.filter((m) => m.camperId !== c.id));
    const r = await unmarkCamper(countId, c.id).catch(() => ({ ok: false as const, error: "Couldn't save that: check the connection." }));
    if (r.ok) setMarks(r.marks);
    else {
      if (before) setMarks((cur) => [...cur, before]);
      toast.error(r.error);
    }
  };

  const handleText = (text: string, fromCamera: boolean) => {
    const code = findScanCode(text, fromCamera);
    if (!code) return show("bad", "That isn't a camper's tag.");
    const c = byCode.get(code);
    if (!c) return show("bad", `Tag ${code} isn't in ${divisions.map((d) => d.name).join(", ")}.`);
    void count(c, "scan");
  };

  const needle = normalizeName(q);
  const matches = (c: CountCamper) => !needle || normalizeName(`${c.name} ${c.bunk ?? ""} ${c.code}`).includes(needle);
  const missing = s.missing.filter(matches).sort(byBunkThenName);
  const counted = campers
    .filter((c) => markOf.has(c.id) && matches(c) && (!onlyMine || !groups.length || markOf.get(c.id)!.group === group))
    .sort((a, b) => (markOf.get(b.id)!.at ?? "").localeCompare(markOf.get(a.id)!.at ?? ""));

  return (
    <div className="space-y-4 pb-16">
      {/* the total, and each bus */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
        <div>
          <div className="text-xs font-medium text-muted-foreground">Counted</div>
          <div className="text-3xl font-semibold tabular-nums">
            {s.counted}
            <span className="text-lg font-normal text-muted-foreground"> / {s.expected}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {s.missing.length ? `${s.missing.length} missing` : s.expected ? "Everyone's here" : "Nobody's checked in in these divisions"}
            {s.extra > 0 && ` · +${s.extra} not checked in`}
          </div>
        </div>
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <span key={g} className={cn("rounded-full border px-2.5 py-1 text-sm", g === group && "border-primary bg-primary-soft/50")}>
                {g} <strong className="tabular-nums">{s.byGroup.get(g) ?? 0}</strong>
              </span>
            ))}
          </div>
        )}
        {canClose && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={async () => {
              if (!closed && !confirm(s.missing.length ? `Close the count with ${s.missing.length} still missing?` : "Close the count?")) return;
              const r = await closeCount(countId, !closed);
              if (!r.ok) return void toast.error(r.error);
              toast.success(r.message);
              setClosed(!closed);
              router.refresh();
            }}
          >
            {closed ? "Open again" : "Close count"}
          </Button>
        )}
      </div>

      {closed && <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">This count is closed. It&apos;s kept as it ended.</p>}

      {/* which bus this phone counts on */}
      {!closed && groups.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{group ? "Counting on" : "Which bus are you counting?"}</p>
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Button key={g} type="button" size="sm" variant={g === group ? "default" : "outline"} onClick={() => pickGroup(g)}>
                {g}
              </Button>
            ))}
          </div>
        </div>
      )}

      {ready && (
        <div className="space-y-3 rounded-xl border bg-card p-3 shadow-[var(--shadow-card)]">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) handleText(typed, false);
              setTyped("");
            }}
          >
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Scan a tag (or type its code)" autoFocus={!camera} inputMode="text" className="h-11" aria-label="Scan a tag" />
            <Button type="button" variant={camera ? "default" : "outline"} className="h-11 shrink-0" onClick={() => setCamera((c) => !c)}>
              {camera ? <CameraOff /> : <CameraIcon />}
              <span className="sr-only sm:not-sr-only">{camera ? "Stop camera" : "Camera"}</span>
            </Button>
          </form>
          {/* the last scan, in a strip that never covers the camera */}
          <div
            className={cn(
              "flex h-12 items-center gap-2 rounded-lg px-3 text-sm font-medium",
              !flash && "bg-muted/40 text-muted-foreground",
              flash?.tone === "ok" && "bg-status-present/15 text-status-present",
              flash?.tone === "again" && "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
              flash?.tone === "bad" && "bg-destructive/10 text-destructive",
            )}
            aria-live="polite"
          >
            {flash ? (
              <>
                {flash.tone === "ok" ? <Check className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
                <span className="truncate" dir="auto">
                  {flash.text}
                </span>
              </>
            ) : (
              "Scan each kid as they get on."
            )}
          </div>
          {camera && <Camera onCode={(t) => handleText(t, true)} onTurnOff={() => setCamera(false)} />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="tablist">
          {(
            [
              ["missing", `Missing (${s.missing.length})`],
              ["counted", `Counted (${s.counted + s.extra})`],
            ] as const
          ).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a name or bunk" className="h-9 pl-9" dir="auto" aria-label="Find a camper" />
        </div>
        {tab === "counted" && groups.length > 0 && group && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Only {group}
          </label>
        )}
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
        {tab === "missing" &&
          missing.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium" dir="auto">
                  {c.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground" dir="auto">
                  {[divisions.length > 1 && c.divisionId ? divName.get(c.divisionId) : null, c.bunk ?? "no bunk", c.code].filter(Boolean).join(" · ")}
                </span>
              </span>
              {ready && (
                <Button size="sm" variant="outline" className="h-9 sm:h-8" onClick={() => count(c, "manual")}>
                  <Check /> Here
                </Button>
              )}
            </li>
          ))}
        {tab === "counted" &&
          counted.map((c) => {
            const m = markOf.get(c.id)!;
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" dir="auto">
                    {c.name}
                    {c.status !== "present" && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">not checked in</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground" dir="auto">
                    {[m.group, c.bunk, `${m.method === "manual" ? "tapped" : "scanned"} ${formatWhen(m.at)}${m.by ? ` by ${m.by}` : ""}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {!closed && (
                  <Button size="sm" variant="ghost" className="h-9 text-muted-foreground sm:h-8" onClick={() => uncount(c)} title="Counted by mistake: take them off">
                    <X /> <span className="sr-only">Take {c.name} off</span>
                  </Button>
                )}
              </li>
            );
          })}
        {((tab === "missing" && !missing.length) || (tab === "counted" && !counted.length)) && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">{q ? "Nobody matches." : tab === "missing" ? "Nobody's missing." : "Nobody counted yet."}</li>
        )}
      </ul>
    </div>
  );
}
