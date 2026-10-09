"use client";
import * as React from "react";
import { toast } from "sonner";
import { Camera as CameraIcon, CameraOff, LogIn, LogOut, Search, Undo2, Volume2, VolumeX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { normalizeName } from "@/lib/import/normalize";
import { parseScan, type OutKind, type ScanMode } from "@/lib/attendance/scan";
import type { CamperStatus } from "@/lib/attendance/machine";
import { cn, formatTime } from "@/lib/utils";
import { rosterStatuses, scanCamper, undoScan } from "@/app/(app)/scan/actions";
import { CamperCard, type TemplateButton } from "./camper-card";
import { Camera } from "./camera";
import { feedback } from "./feedback";

export type RosterEntry = { id: string; code: string; name: string; first: string; last: string; where: string; status: CamperStatus };
type Flash = { tone: "in" | "out" | "home" | "already" | "error"; title: string; detail: string };
type Recent = { key: number; camperId: string; name: string; verb: string; tone: Flash["tone"]; eventId?: string; at: number; undone?: boolean };

const FLASH: Record<Flash["tone"], string> = {
  in: "bg-status-present text-white",
  out: "bg-status-out text-amber-950",
  home: "bg-status-departed text-white",
  already: "bg-slate-600 text-white",
  error: "bg-destructive text-white",
};
const UNDO_MS = 30000;
const MODE_KEEP_MS = 3 * 60 * 60 * 1000;

export function Scanner({ roster, templates, canScan }: { roster: RosterEntry[]; templates: TemplateButton[]; canScan: boolean }) {
  const [mode, setMode] = React.useState<ScanMode>(canScan ? "in" : "lookup");
  const [outKind, setOutKind] = React.useState<OutKind>("back");
  const [statuses, setStatuses] = React.useState<Record<string, CamperStatus>>(() => Object.fromEntries(roster.map((r) => [r.id, r.status])));
  const [q, setQ] = React.useState("");
  const [flash, setFlash] = React.useState<Flash | null>(null);
  const [recent, setRecent] = React.useState<Recent[]>([]);
  const [card, setCard] = React.useState<string | null>(null);
  // the camera is on unless this device turned it off (a desk with a USB scanner)
  const [camera, setCamera] = React.useState(false);
  const [sound, setSound] = React.useState(true);
  const [, setTick] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const lastHit = React.useRef<{ id: string; at: number } | null>(null);
  const focusBox = React.useCallback(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, []);
  React.useEffect(focusBox, [focusBox]);
  const byCode = React.useMemo(() => new Map(roster.map((r) => [r.code, r])), [roster]);
  const index = React.useMemo(() => roster.map((r) => ({ r, n: normalizeName(`${r.first} ${r.last}`), f: normalizeName(r.first), l: normalizeName(r.last) })), [roster]);

  // remember choices on this device
  React.useEffect(() => {
    try {
      // a mode chosen recently (the same shift) carries over; the next morning starts on Check in
      const saved = JSON.parse(localStorage.getItem("kinus:scan-mode") ?? "null") as { m: ScanMode; at: number } | null;
      if (saved && Date.now() - saved.at < MODE_KEEP_MS && (canScan || saved.m === "lookup")) setMode(saved.m);
      setSound(localStorage.getItem("kinus:sound") !== "off");
      setCamera(localStorage.getItem("kinus:camera") !== "off");
    } catch {}
  }, [canScan]);
  const choose = (m: ScanMode) => {
    setMode(m);
    try {
      localStorage.setItem("kinus:scan-mode", JSON.stringify({ m, at: Date.now() }));
    } catch {}
    focusBox();
  };
  // "Not coming back" is never remembered: each time it's a choice made on purpose
  const chooseOut = (o: OutKind) => setOutKind(o);

  // keep statuses fresh while the screen is open
  React.useEffect(() => {
    const t = setInterval(() => rosterStatuses().then((s) => setStatuses((cur) => ({ ...cur, ...s }))).catch(() => undefined), 20000);
    const u = setInterval(() => setTick((x) => x + 1), 5000);
    return () => {
      clearInterval(t);
      clearInterval(u);
    };
  }, []);

  const show = React.useCallback((f: Flash) => {
    setFlash(f);
    setTimeout(() => setFlash((cur) => (cur === f ? null : cur)), f.tone === "error" ? 2600 : 1700);
  }, []);

  const act = React.useCallback(
    async (r: RosterEntry, method: "scan" | "manual") => {
      setQ("");
      if (mode === "lookup") {
        setCard(r.id);
        return;
      }
      const now = Date.now();
      if (lastHit.current && lastHit.current.id === r.id && now - lastHit.current.at < 3000) return; // camera re-reads
      lastHit.current = { id: r.id, at: now };
      const o = await scanCamper(r.id, mode, outKind, method);
      if (!o.ok) {
        feedback("error");
        show({ tone: "error", title: r.name, detail: o.error });
        return;
      }
      setStatuses((s) => ({ ...s, [o.camperId]: o.status }));
      if (o.kind === "act") {
        feedback("ok");
        show({ tone: o.tone, title: o.name, detail: o.verb + (o.autoPrinted.length ? ` · ${o.autoPrinted.join(", ")} sent to print` : "") });
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
    [mode, outKind, show, focusBox],
  );

  const handleText = React.useCallback(
    (text: string, method: "scan" | "manual") => {
      const code = parseScan(text);
      if (!code) return false;
      const r = byCode.get(code);
      if (!r) {
        feedback("error");
        show({ tone: "error", title: `Code ${code}`, detail: "No camper with this code in your area." });
        setQ("");
        return true;
      }
      act(r, method);
      return true;
    },
    [byCode, act, show],
  );
  const onCameraCode = React.useCallback((t: string) => void handleText(t, "scan"), [handleText]);

  // USB/Bluetooth scanners type fast and press Enter; catch them even when the box isn't focused
  React.useEffect(() => {
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === input.current) return;
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      const now = Date.now();
      if (now - last > 80) buf = "";
      last = now;
      if (e.key === "Enter") {
        if (buf.length >= 6 && handleText(buf, "scan")) e.preventDefault();
        buf = "";
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleText]);

  const needle = normalizeName(q);
  const matches =
    needle.length >= 2 && !parseScan(q)
      ? index
          .filter(({ r, n, f, l }) => n.includes(needle) || f.startsWith(needle) || l.startsWith(needle) || r.code.startsWith(q.trim()))
          .sort((a, b) => Number(b.n.startsWith(needle)) - Number(a.n.startsWith(needle)) || a.r.last.localeCompare(b.r.last))
          .slice(0, 8)
          .map((x) => x.r)
      : [];

  const setCameraOn = (v: boolean) => {
    setCamera(v);
    try {
      localStorage.setItem("kinus:camera", v ? "on" : "off");
    } catch {}
  };
  const turnOffCamera = () => setCameraOn(false);

  const undo = async (r: Recent) => {
    if (!r.eventId) return;
    const res = await undoScan(r.eventId);
    if (!res.ok) return void toast.error(res.error);
    setStatuses((s) => ({ ...s, [r.camperId]: res.status }));
    setRecent((x) => x.map((y) => (y.key === r.key ? { ...y, undone: true } : y)));
    toast.success(`Undone: ${r.name}`);
  };

  const tint = mode === "in" ? "ring-status-present/40" : mode === "out" ? (outKind === "home" ? "ring-status-departed/40" : "ring-status-out/50") : "ring-border";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className={cn("space-y-3 rounded-2xl border bg-card p-3 shadow-[var(--shadow-card)] ring-4", tint)}>
        {!canScan && <p className="px-1 text-sm text-muted-foreground">Scan a tag or type a name to look a camper up. Your account can look campers up but not check them in.</p>}
        <div className={cn("grid grid-cols-3 gap-2", !canScan && "hidden")} role="tablist" aria-label="What a scan does">
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
                      ? outKind === "home"
                        ? "bg-status-departed text-white"
                        : "bg-status-out text-amber-950"
                      : "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
        {mode === "out" && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["back", "Coming back later"],
                ["home", "Not coming back"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => chooseOut(k)}
                className={cn("h-10 rounded-lg border text-sm font-medium", outKind === k ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
            }}
            placeholder="Scan a tag or type a name"
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
                    {r.where} · {r.code}
                  </span>
                </span>
                <StatusBadge status={statuses[r.id] ?? r.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {needle.length >= 2 && !matches.length && !parseScan(q) && <p className="px-1 text-sm text-muted-foreground">No camper in your area matches “{q}”.</p>}

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={cn(mode === "out" && "rounded-md px-2 py-1 text-sm font-semibold", mode === "out" && (outKind === "home" ? "bg-status-departed text-white" : "bg-status-out text-amber-950"))}>
            {mode === "in" && "Scanning a tag or tapping a name checks the camper in."}
            {mode === "out" && (outKind === "home" ? "You're checking campers OUT for the day: not coming back." : "You're checking campers OUT: they'll come back.")}
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
            <Button variant={camera ? "default" : "outline"} size="sm" onClick={() => (camera ? turnOffCamera() : setCameraOn(true))}>
              {camera ? <CameraOff /> : <CameraIcon />} {camera ? "Stop camera" : "Camera"}
            </Button>
          </span>
        </div>
        {camera && (
          <div className={cn(q.trim() && "hidden")}>
            <Camera onCode={onCameraCode} onTurnOff={turnOffCamera} />
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
                <button className="min-w-0 flex-1 text-left" onClick={() => setCard(r.camperId)}>
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

      <Dialog open={mode !== "lookup" && Boolean(card)} onOpenChange={(o) => !o && setCard(null)}>
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
