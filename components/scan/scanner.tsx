"use client";
import * as React from "react";
import { toast } from "sonner";
import { Camera as CameraIcon, CameraOff, DoorOpen, LogIn, LogOut, Search, Undo2, Volume2, VolumeX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { normalizeName } from "@/lib/import/normalize";
import { findScanCode, looksLikeScan, type ScanMode } from "@/lib/attendance/scan";
import type { CamperStatus } from "@/lib/attendance/machine";
import { cn, formatTime } from "@/lib/utils";
import { lookupCode, rosterStatuses, scanCamper, undoScan } from "@/app/(app)/scan/actions";
import { checkoutStatuses, finalCheckout, lookupCheckoutCode } from "@/app/(app)/checkout/actions";
import { CamperCard, type TemplateButton } from "./camper-card";
import { Camera } from "./camera";
import { feedback } from "./feedback";

export type RosterEntry = { id: string; code: string; name: string; first: string; last: string; where: string; status: CamperStatus; div: string | null };
type Line = { id: string; name: string; color: string | null };
const ANY = "any";
type Flash = { tone: "in" | "out" | "home" | "already" | "error"; title: string; detail: string };
type Recent = { key: number; camperId: string; name: string; verb: string; tone: Flash["tone"]; eventId?: string; at: number; undone?: boolean };

const FLASH: Record<Flash["tone"], string> = {
  in: "bg-status-present text-white",
  out: "bg-status-out text-amber-950",
  home: "bg-status-departed text-white",
  already: "bg-slate-600 text-white",
  error: "bg-destructive text-white",
};
// the server allows 30 s; the button goes a little earlier so a late tap doesn't fail
const UNDO_MS = 25000;
const MAX_RESULTS = 12;
const MODE_KEEP_MS = 3 * 60 * 60 * 1000;

export function Scanner({
  roster,
  templates,
  canScan,
  divisions = [],
  final,
}: {
  roster: RosterEntry[];
  templates: TemplateButton[];
  canScan: boolean;
  divisions?: Line[];
  /** Final check-out: every scan or tap records "gone home", for any division of the camp. */
  final?: { campName: string; divisions: Line[] };
}) {
  // someone who checks in more than one division says which line they're at, so a camper
  // from another division isn't checked in by mistake (final check-out is for all of them)
  const multi = !final && divisions.length > 1;
  const [line, setLine] = React.useState<string | null>(null);
  const [wrong, setWrong] = React.useState<{ r: RosterEntry; method: "scan" | "manual" } | null>(null);
  const lineDiv = divisions.find((d) => d.id === line) ?? null;
  const [mode, setMode] = React.useState<ScanMode>(final ? "out" : canScan ? "in" : "lookup");
  const [statuses, setStatuses] = React.useState<Record<string, CamperStatus>>(() => Object.fromEntries(roster.map((r) => [r.id, r.status])));
  const [q, setQ] = React.useState("");
  const [flash, setFlash] = React.useState<Flash | null>(null);
  const [recent, setRecent] = React.useState<Recent[]>([]);
  const [card, setCard] = React.useState<string | null>(null);
  // the camera starts every time the page opens; only "Don't use the camera here" (a desk
  // with a USB scanner, a laptop without a camera) is remembered on the device
  const [camera, setCamera] = React.useState(false);
  const [sound, setSound] = React.useState(true);
  const [, setTick] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  // campers found on the server after the page loaded (walk-ins added since)
  const [extra, setExtra] = React.useState<RosterEntry[]>([]);
  const focusBox = React.useCallback(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, []);
  React.useEffect(focusBox, [focusBox]);
  const byCode = React.useMemo(() => new Map([...roster, ...extra].map((r) => [r.code, r])), [roster, extra]);
  const index = React.useMemo(() => [...roster, ...extra].map((r) => ({ r, n: normalizeName(`${r.first} ${r.last}`), f: normalizeName(r.first), l: normalizeName(r.last) })), [roster, extra]);

  // remember choices on this device
  React.useEffect(() => {
    try {
      // the mode carries over within the same shift, so a phone that sleeps and reloads
      // mid-trip keeps checking kids out; the next morning starts on Check in
      const saved = JSON.parse(localStorage.getItem("kinus:scan-mode") ?? "null") as { m: ScanMode; at: number } | null;
      if (!final && saved && Date.now() - saved.at < MODE_KEEP_MS && (canScan || saved.m === "lookup")) setMode(saved.m);
      const savedLine = JSON.parse(localStorage.getItem("kinus:line") ?? "null") as { id: string; at: number } | null;
      if (savedLine && Date.now() - savedLine.at < MODE_KEEP_MS && (savedLine.id === ANY || divisions.some((d) => d.id === savedLine.id))) setLine(savedLine.id);
      setSound(localStorage.getItem("kinus:sound") !== "off");
      setCamera(localStorage.getItem("kinus:no-camera") !== "1");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScan]);
  const chooseLine = (id: string | null) => {
    setLine(id);
    try {
      if (id) localStorage.setItem("kinus:line", JSON.stringify({ id, at: Date.now() }));
      else localStorage.removeItem("kinus:line");
    } catch {}
    focusBox();
  };
  const choose = (m: ScanMode) => {
    setMode(m);
    try {
      localStorage.setItem("kinus:scan-mode", JSON.stringify({ m, at: Date.now() }));
    } catch {}
    focusBox();
  };

  // keep statuses fresh while the screen is open
  React.useEffect(() => {
    const t = setInterval(() => (final ? checkoutStatuses() : rosterStatuses()).then((s) => setStatuses((cur) => ({ ...cur, ...s }))).catch(() => undefined), 20000);
    const u = setInterval(() => setTick((x) => x + 1), 5000);
    return () => {
      clearInterval(t);
      clearInterval(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = React.useCallback((f: Flash) => {
    setFlash(f);
    setTimeout(() => setFlash((cur) => (cur === f ? null : cur)), f.tone === "error" ? 2600 : 1700);
  }, []);

  const act = React.useCallback(
    async (r: RosterEntry, method: "scan" | "manual", anyway = false) => {
      setQ("");
      if (mode === "lookup") {
        setCard(r.id);
        return;
      }
      // a camper from another division at this line: ask before recording anything
      if (multi && line && line !== ANY && r.div !== line && !anyway) {
        feedback("error");
        setWrong({ r, method });
        return;
      }
      // (the camera itself ignores a tag held in view; a repeat scan here is on purpose and
      // gets "Already checked in" from the server)
      const now = Date.now();
      const o = final ? await finalCheckout(r.id, method) : await scanCamper(r.id, mode as "in" | "out", "back", method);
      if (!o.ok) {
        feedback("error");
        show({ tone: "error", title: r.name, detail: o.error });
        return;
      }
      setStatuses((s) => ({ ...s, [o.camperId]: o.status }));
      if (o.kind === "act") {
        feedback("ok");
        show({ tone: o.tone, title: o.name, detail: o.verb + (multi ? ` · ${r.where}` : "") + (o.autoPrinted.length ? ` · ${o.autoPrinted.join(", ")} sent to print` : "") });
        setRecent((x) => [{ key: now, camperId: o.camperId, name: o.name, verb: o.verb, tone: o.tone, eventId: o.eventId, at: now }, ...x].slice(0, 8));
      } else {
        feedback("already");
        // "Already checked in · 9:42 by Sarah" helps; for "hasn't checked in yet" the last event would mislead
        const detail = `${o.message}${o.kind === "already" && o.since ? ` · ${formatTime(o.since)}${o.by ? ` by ${o.by}` : ""}` : ""}`;
        show({ tone: "already", title: o.name, detail });
        setRecent((x) => [{ key: now, camperId: o.camperId, name: o.name, verb: o.message, tone: "already" as const, at: now }, ...x].slice(0, 8));
      }
      focusBox();
    },
    [mode, show, focusBox, multi, line, final],
  );

  const unreadable = React.useCallback(
    (text: string) => {
      feedback("error");
      show({ tone: "error", title: "Couldn't read that tag", detail: `“${text.trim().slice(0, 24)}”: scan it again, or type the name.` });
      setQ("");
    },
    [show],
  );

  const handleText = React.useCallback(
    (text: string, method: "scan" | "manual") => {
      const code = findScanCode(text);
      if (!code) return false;
      setQ("");
      const r = byCode.get(code);
      if (r) {
        act(r, method);
        return true;
      }
      // not on this page: a walk-in added since, or a child in the wrong line
      ;(final ? lookupCheckoutCode(code) : lookupCode(code))
        .then((l) => {
          if (l.found) {
            setExtra((x) => [...x, l.entry]);
            setStatuses((st) => ({ ...st, [l.entry.id]: l.entry.status }));
            act(l.entry, method);
          } else {
            feedback("error");
            show({ tone: "error", title: `Code ${code}`, detail: l.message });
          }
        })
        .catch(() => {
          feedback("error");
          show({ tone: "error", title: `Code ${code}`, detail: "Couldn't look this code up. Check the connection and scan again." });
        });
      return true;
    },
    [byCode, act, show, final],
  );
  const onCameraCode = React.useCallback((t: string) => void handleText(t, "scan"), [handleText]);

  // USB/Bluetooth scanners type fast and press Enter; catch them even when the box isn't focused.
  // Gaps are measured with the keys' own timestamps: a busy phone (camera decoding) delivers
  // a scan's keys late and bunched, and must not lose the start of the code.
  React.useEffect(() => {
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === input.current) return;
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (e.timeStamp - last > 1000) buf = "";
      last = e.timeStamp;
      if (e.key === "Enter") {
        if (buf.length >= 5) {
          e.preventDefault();
          if (!handleText(buf, "scan") && looksLikeScan(buf)) unreadable(buf);
        }
        buf = "";
      } else if (e.key.length === 1) buf = (buf + e.key).slice(-40);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleText, unreadable]);

  const needle = normalizeName(q);
  const allMatches =
    needle.length >= 2 && !findScanCode(q)
      ? index
          .filter(({ r, n, f, l }) => n.includes(needle) || f.startsWith(needle) || l.startsWith(needle) || r.code.startsWith(q.trim()))
          .sort((a, b) => Number(b.n.startsWith(needle)) - Number(a.n.startsWith(needle)) || a.r.last.localeCompare(b.r.last))
      : [];
  const matches = allMatches.slice(0, MAX_RESULTS).map((x) => x.r);

  // Stop / Start: just for now
  const setCameraOn = (v: boolean) => {
    setCamera(v);
    try {
      if (v) localStorage.removeItem("kinus:no-camera");
    } catch {}
  };
  // "Don't use the camera here": this device, from now on (Start camera undoes it)
  const neverCamera = () => {
    setCamera(false);
    try {
      localStorage.setItem("kinus:no-camera", "1");
    } catch {}
  };

  const undo = async (r: Recent) => {
    if (!r.eventId) return;
    const res = await undoScan(r.eventId);
    if (!res.ok) return void toast.error(res.error);
    setStatuses((s) => ({ ...s, [r.camperId]: res.status }));
    setRecent((x) => x.map((y) => (y.key === r.key ? { ...y, undone: true } : y)));
    toast.success(`Undone: ${r.name}`);
  };

  const tint = final ? "ring-status-departed/40" : mode === "in" ? "ring-status-present/40" : mode === "out" ? "ring-status-out/50" : "ring-border";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {multi && canScan && mode !== "lookup" && (
        <LineBar divisions={divisions} line={line} lineDiv={lineDiv} onChoose={chooseLine} />
      )}
      {final && <CheckoutProgress campName={final.campName} divisions={final.divisions} roster={[...roster, ...extra]} statuses={statuses} />}
      <div className={cn("space-y-3 rounded-2xl border bg-card p-3 shadow-[var(--shadow-card)] ring-4", tint)}>
        {final && (
          <div className="flex items-center gap-3 rounded-xl bg-status-departed px-4 py-3 text-white">
            <DoorOpen className="size-6 shrink-0" />
            <span className="min-w-0">
              <span className="block font-semibold">Final check-out · {final.campName}</span>
              <span className="block text-sm opacity-90">Scanning a tag or tapping a name checks the camper out: going home.</span>
            </span>
          </div>
        )}
        {!canScan && <p className="px-1 text-sm text-muted-foreground">Scan a tag or type a name to look a camper up. Your account can look campers up but not check them in.</p>}
        <div className={cn("grid grid-cols-3 gap-2", (!canScan || final) && "hidden")} role="tablist" aria-label="What a scan does">
          {(
            [
              ["in", "Check in", LogIn],
              ["out", "Check out", LogOut],
              ["lookup", "Look up", Search],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              disabled={m !== "lookup" && !canScan}
              onClick={() => choose(m)}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40",
                mode === m
                  ? m === "in"
                    ? "bg-status-present text-white"
                    : m === "out"
                      ? "bg-status-out text-amber-950"
                      : "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              <Icon className="size-5" />
              {m === "out" ? "Check out · coming back" : label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={input}
            id="scan-input"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (handleText(q, "scan")) return;
              if (matches.length === 1) act(matches[0], "manual");
              else if (!matches.length && looksLikeScan(q)) unreadable(q);
            }}
            placeholder={final ? `Scan a tag or type any camper in ${final.campName}` : "Scan a tag or type a name"}
            className="h-14 pl-11 text-lg"
            dir="auto"
            aria-label="Scan or search"
          />
        </div>
      {matches.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {matches.map((r) => (
            <li key={r.id}>
              <button onClick={() => act(r, "manual")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" dir="auto">
                    {r.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground" dir="auto">
                    {multi && line && line !== ANY && r.div !== line && <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Other line</span>}
                    {r.where} · {r.code}
                  </span>
                </span>
                <StatusBadge status={statuses[r.id] ?? r.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {needle.length >= 2 && !matches.length && !findScanCode(q) && <p className="px-1 text-sm text-muted-foreground">No camper {final ? `in ${final.campName}` : "in your area"} matches “{q}”.</p>}
      {allMatches.length > matches.length && <p className="px-1 text-sm text-muted-foreground">{allMatches.length - matches.length} more match: type more of the name.</p>}

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={cn(mode === "out" && !final && "rounded-md bg-status-out px-2 py-1 text-sm font-semibold text-amber-950")}>
            {mode === "in" && "Scanning a tag or tapping a name checks the camper in."}
            {mode === "out" && !final && "You're checking campers OUT: they'll come back. Going home is Final check-out."}
            {mode === "lookup" && "Scanning a tag or tapping a name opens the camper. Nothing is recorded."}
          </span>
          <span className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const v = !sound;
                setSound(v);
                try {
                  localStorage.setItem("kinus:sound", v ? "on" : "off");
                } catch {}
              }}
              aria-label={sound ? "Turn sound off" : "Turn sound on"}
            >
              {sound ? <Volume2 /> : <VolumeX />}
            </Button>
            <Button variant={camera ? "default" : "outline"} size="sm" onClick={() => setCameraOn(!camera)}>
              {camera ? <CameraOff /> : <CameraIcon />} {camera ? "Stop camera" : "Start camera"}
            </Button>
          </span>
        </div>
        {camera && (
          <div className={cn(q.trim() && "hidden")}>
            <Camera onCode={onCameraCode} onTurnOff={neverCamera} />
          </div>
        )}
      </div>

      {mode === "lookup" && card && (
        <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)]">
          <CamperCard
            camperId={card}
            templates={templates}
            canScan={canScan}
            onAction={(o) => setStatuses((s) => ({ ...s, [o.camperId]: o.status }))}
          />
        </div>
      )}

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Just now</h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {recent.map((r) => (
              <li key={r.key} className="flex items-center gap-3 px-4 py-2.5">
                <button className="min-w-0 flex-1 text-left disabled:cursor-default" disabled={Boolean(final)} onClick={() => setCard(r.camperId)}>
                  <span className={cn("block truncate font-medium", r.undone && "line-through opacity-60")} dir="auto">
                    {r.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {r.undone ? "Undone" : r.verb} · {formatTime(new Date(r.at).toISOString())}
                  </span>
                </button>
                {r.eventId && !r.undone && Date.now() - r.at < UNDO_MS && (
                  <Button size="sm" variant="outline" onClick={() => undo(r)}>
                    <Undo2 /> Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {flash && (
        <button
          className={cn("fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 p-8 text-center", FLASH[flash.tone])}
          onClick={() => setFlash(null)}
          aria-live="assertive"
        >
          <span className="text-4xl font-bold sm:text-5xl" dir="auto">
            {flash.title}
          </span>
          <span className="text-xl font-medium opacity-90">{flash.detail}</span>
        </button>
      )}

      <Dialog open={Boolean(wrong)} onOpenChange={(o) => !o && (setWrong(null), focusBox())}>
        <DialogContent className="border-amber-400">
          <DialogHeader>
            <DialogTitle>Not your line</DialogTitle>
          </DialogHeader>
          {wrong && (
            <div className="space-y-4">
              <p className="text-lg">
                <span className="font-semibold" dir="auto">
                  {wrong.r.name}
                </span>{" "}
                is in <span className="font-semibold" dir="auto">{wrong.r.where}</span>.
              </p>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                You&apos;re checking in <strong dir="auto">{lineDiv?.name}</strong>. Send them to their own line, or record it here anyway.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => (setWrong(null), focusBox())} autoFocus>
                  Don&apos;t record
                </Button>
                <Button
                  onClick={() => {
                    const w = wrong;
                    setWrong(null);
                    act(w.r, w.method, true);
                  }}
                >
                  {mode === "in" ? "Check in anyway" : "Check out anyway"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!final && mode !== "lookup" && Boolean(card)} onOpenChange={(o) => !o && setCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="sr-only">Camper</DialogTitle>
          </DialogHeader>
          {card && <CamperCard camperId={card} templates={templates} canScan={canScan} onAction={(o) => setStatuses((s) => ({ ...s, [o.camperId]: o.status }))} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Which line (division) this device is checking in: chosen once per shift. */
function LineBar({ divisions, line, lineDiv, onChoose }: { divisions: Line[]; line: string | null; lineDiv: Line | null; onChoose: (id: string | null) => void }) {
  if (!line) {
    return (
      <div className="space-y-2 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30" role="alert">
        <p className="font-semibold text-amber-950 dark:text-amber-100">Which line are you checking in?</p>
        <p className="text-sm text-amber-900 dark:text-amber-200">You can check in {divisions.length} divisions. Pick yours, and Kinus stops you if a camper from another division is scanned.</p>
        <div className="flex flex-wrap gap-2">
          {divisions.map((d) => (
            <Button key={d.id} variant="outline" className="bg-card" onClick={() => onChoose(d.id)}>
              <span className="size-3 rounded-full" style={{ background: d.color ?? "var(--muted-foreground)" }} />
              <span dir="auto">{d.name}</span>
            </Button>
          ))}
          <Button variant="ghost" onClick={() => onChoose(ANY)}>
            Any division
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-[var(--shadow-card)]"
      style={{ background: lineDiv?.color ?? "var(--foreground)" }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium uppercase tracking-wide opacity-80">{lineDiv ? "Checking in" : "Checking in any division"}</span>
        <span className="block truncate text-lg font-bold" dir="auto">
          {lineDiv ? lineDiv.name : "Every camper is recorded, whatever their division"}
        </span>
      </span>
      <Button size="sm" variant="secondary" onClick={() => onChoose(null)}>
        Change
      </Button>
    </div>
  );
}

/**
 * Final check-out progress for the camp: how many are still here in each division, and (tap a
 * division) who, so nobody is left waiting at the end.
 */
function CheckoutProgress({ campName, divisions, roster, statuses }: { campName: string; divisions: Line[]; roster: RosterEntry[]; statuses: Record<string, CamperStatus> }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const status = (r: RosterEntry) => statuses[r.id] ?? r.status;
  const here = (r: RosterEntry) => status(r) === "present" || status(r) === "out";
  const per = divisions.map((d) => {
    const mine = roster.filter((r) => r.div === d.id);
    return { d, left: mine.filter(here), gone: mine.filter((r) => status(r) === "departed").length };
  });
  const left = per.reduce((n, p) => n + p.left.length, 0);
  const gone = per.reduce((n, p) => n + p.gone, 0);
  const shown = per.find((p) => p.d.id === open);
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-3 shadow-[var(--shadow-card)]">
      <p className="px-1 text-sm">
        <span className="font-semibold" dir="auto">{campName}</span>: <strong>{left}</strong> still here · {gone} gone home
      </p>
      <div className="flex flex-wrap gap-1.5">
        {per.map((p) => (
          <button
            key={p.d.id}
            type="button"
            onClick={() => setOpen(open === p.d.id ? null : p.d.id)}
            aria-pressed={open === p.d.id}
            className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm", open === p.d.id ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted", !p.left.length && "opacity-60")}
          >
            <span className="size-2.5 rounded-full" style={{ background: p.d.color ?? "var(--muted-foreground)" }} />
            <span dir="auto">{p.d.name}</span>
            <span className="font-semibold">{p.left.length ? `${p.left.length} left` : "all gone"}</span>
          </button>
        ))}
      </div>
      {shown && (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border text-sm">
          {shown.left
            .slice()
            .sort((a, b) => a.where.localeCompare(b.where) || a.last.localeCompare(b.last))
            .map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate" dir="auto">
                  {r.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground" dir="auto">
                  {r.where.split(" · ").slice(1).join(" · ")}
                  {status(r) === "out" && " · out now"}
                </span>
              </li>
            ))}
          {!shown.left.length && <li className="px-3 py-3 text-muted-foreground">Everyone in {shown.d.name} has gone home.</li>}
        </ul>
      )}
    </section>
  );
}
