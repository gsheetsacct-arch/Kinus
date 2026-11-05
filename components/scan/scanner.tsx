"use client";
import * as React from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Camera as CameraIcon, CameraOff, ChevronUp, DoorOpen, LogIn, LogOut, Printer, Search, Tag, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { normalizeName } from "@/lib/import/normalize";
import { matchScore, searchEntry } from "@/lib/search";
import { findScanCode, looksLikeScan, type ScanMode } from "@/lib/attendance/scan";
import type { CamperStatus } from "@/lib/attendance/machine";
import { cn, formatTime } from "@/lib/utils";
import { lookupCode, recentScansAndResets, rosterStatuses, scanCamper, undoScan } from "@/app/(app)/scan/actions";
import { checkoutStatuses, finalCheckout, lookupCheckoutCode } from "@/app/(app)/checkout/actions";
import { CamperCard, type TemplateButton } from "./camper-card";
import { Camera } from "./camera";
import { feedback, unlockSound } from "./feedback";

/** heb: the Hebrew name, for a camper in a Hebrew-language division (shown first, searched too) */
export type RosterEntry = { id: string; code: string; name: string; first: string; last: string; where: string; status: CamperStatus; div: string | null; buzzer?: number | null; heb?: string };
type Line = { id: string; name: string; color: string | null };
const ANY = "any";
/** ask: an already checked-in camper scanned at check-in, offered a check-out */
/** labels: a camper scanned again, offered their labels (a new name tag…) */
type Flash = { tone: "in" | "out" | "home" | "already" | "error"; title: string; detail: string; ask?: RosterEntry; labels?: RosterEntry };
type Recent = { key: string; camperId: string; name: string; verb: string; tone: Flash["tone"]; eventId?: string; at: number; undone?: boolean; undoable?: boolean; by?: string | null };

const FLASH: Record<Flash["tone"], string> = {
  in: "bg-status-present text-white",
  out: "bg-status-out text-amber-950",
  home: "bg-status-departed text-white",
  already: "bg-slate-600 text-white",
  error: "bg-destructive text-white",
};
// the picture's edge takes the result's colour for a moment: readable from across the table
const FLASH_RING: Record<Flash["tone"], string> = {
  in: "ring-status-present",
  out: "ring-status-out",
  home: "ring-status-departed",
  already: "ring-slate-500",
  error: "ring-destructive",
};
// the server allows 15 minutes (migration 0053); the button goes a little earlier
const UNDO_MS = 14 * 60_000;
const RECENT_MAX = 50;
/** The list on this device: kept across reloads and sign-ins (as the check-ins, 16 hours). */
const RECENT_KEY = "kinus:recent";
const RECENT_KEEP_MS = 16 * 3600_000;
const MAX_RESULTS = 12;
const MODE_KEEP_MS = 3 * 60 * 60 * 1000;

export function Scanner({
  roster,
  templates,
  canScan,
  divisions = [],
  final,
  printQueue = false,
  campDivisionIds = null,
  resets = {},
}: {
  /** When divisions' check-ins were reset (Settings): their Recent entries from before are dropped. */
  resets?: Record<string, string>;
  /** The camp chosen at the top of the menu: its divisions (null: every camp). The recent list shows only its campers. */
  campDivisionIds?: string[] | null;
  /** This person uses the print queue: a quick way there (their line's labels). */
  printQueue?: boolean;
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
  // name in any order, code; similar names and misspellings too (lib/search)
  const index = React.useMemo(() => [...roster, ...extra].map((r) => ({ r, e: searchEntry(r.heb ? `${r.first} ${r.last} ${r.heb}` : `${r.first} ${r.last}`, r.code, [], r.buzzer ?? null) })), [roster, extra]);

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
    // only while the page is on screen (a locked phone doesn't keep asking)
    const t = setInterval(() => document.visibilityState === "visible" && (final ? checkoutStatuses() : rosterStatuses()).then((s) => setStatuses((cur) => ({ ...cur, ...s }))).catch(() => undefined), 20000);
    const u = setInterval(() => setTick((x) => x + 1), 5000);
    return () => {
      clearInterval(t);
      clearInterval(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = React.useCallback((f: Flash) => {
    setFlash(f);
    // a question stays up long enough to answer it
    setTimeout(() => setFlash((cur) => (cur === f ? null : cur)), f.ask ? 12000 : f.labels ? 8000 : f.tone === "error" ? 6000 : 4000);
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
        show({ tone: o.tone, title: r.heb ?? o.name, detail: o.verb + (multi ? ` · ${r.where}` : "") + (o.autoPrinted.length ? ` · ${o.autoPrinted.join(", ")} sent to print` : "") });
        setRecent((x) => [{ key: o.eventId, camperId: o.camperId, name: r.heb ?? o.name, verb: o.verb, tone: o.tone, eventId: o.eventId, at: now, undoable: true }, ...x].slice(0, RECENT_MAX));
      } else {
        feedback("already");
        // "Already checked in · 9:42 by Sarah" helps; for "hasn't checked in yet" the last event would mislead
        const detail = `${o.message}${o.kind === "already" && o.since ? ` · ${formatTime(o.since)}${o.by ? ` by ${o.by}` : ""}` : ""}`;
        // already here, scanned at check-in: maybe they're on their way out, so offer it
        const ask = !final && mode === "in" && o.kind === "already" && o.status === "present" ? r : undefined;
        show({ tone: "already", title: r.heb ?? o.name, detail, ask, labels: templates.length ? r : undefined });
        setRecent((x) => [{ key: `a${now}`, camperId: o.camperId, name: r.heb ?? o.name, verb: o.message, tone: "already" as const, at: now }, ...x].slice(0, RECENT_MAX));
      }
      focusBox();
    },
    [mode, show, focusBox, multi, line, final, templates.length],
  );

  // the check-out offered for a camper scanned again at check-in
  const checkOutNow = React.useCallback(
    async (r: RosterEntry) => {
      setFlash(null);
      const now = Date.now();
      const o = await scanCamper(r.id, "out", "back", "manual");
      if (!o.ok) {
        feedback("error");
        show({ tone: "error", title: r.name, detail: o.error });
        return;
      }
      setStatuses((st) => ({ ...st, [o.camperId]: o.status }));
      if (o.kind === "act") {
        feedback("ok");
        show({ tone: o.tone, title: r.heb ?? o.name, detail: o.verb });
        setRecent((x) => [{ key: o.eventId, camperId: o.camperId, name: r.heb ?? o.name, verb: o.verb, tone: o.tone, eventId: o.eventId, at: now, undoable: true }, ...x].slice(0, RECENT_MAX));
      } else show({ tone: "already", title: r.heb ?? o.name, detail: o.message });
      focusBox();
    },
    [show, focusBox],
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
    (text: string, method: "scan" | "manual", camera = false) => {
      const code = findScanCode(text, camera);
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
  const onCameraCode = React.useCallback((t: string) => void handleText(t, "scan", true), [handleText]);

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
          .map(({ r, e }) => ({ r, score: matchScore(e, q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || a.r.last.localeCompare(b.r.last))
      : [];
  const matches = allMatches.slice(0, MAX_RESULTS).map((x) => x.r);
  // a name that's only similar (spelled differently) is never checked in by Enter: tap it
  const similar = new Set(allMatches.filter((x) => x.score < 1).map((x) => x.r.id));

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

  const hebOf = React.useMemo(() => new Map(roster.filter((r) => r.heb).map((r) => [r.id, r.heb!])), [roster]);
  // the check-ins today, kept across reloads and sign-ins (the newest first): this device's
  // list, and from the server this person's and, on a check-in login, its divisions' (other
  // phones too), refreshed every 20 seconds
  const rosterIds = React.useMemo(() => new Set(roster.map((r) => r.id)), [roster]);
  // check-ins reset (Settings): what this list had from before is gone for those divisions
  const rosterDiv = React.useMemo(() => new Map(roster.map((r) => [r.id, r.div])), [roster]);
  const sinceReset = React.useCallback(
    (list: Recent[], resetAt: Record<string, string>) =>
      list.filter((r) => {
        const d = rosterDiv.get(r.camperId);
        const at = d ? resetAt[d] : undefined;
        return !at || r.at > Date.parse(at);
      }),
    [rosterDiv],
  );
  const [recentReady, setRecentReady] = React.useState(false);
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
      // only campers this page shows (another login on this phone may see other campers)
      const keep = Array.isArray(saved) ? saved.filter((r) => r && rosterIds.has(r.camperId) && Date.now() - r.at < RECENT_KEEP_MS) : [];
      // Undo comes back from the server, for the one who recorded it
      if (keep.length) setRecent((cur) => sinceReset(mergeRecent(cur, keep.map((r) => ({ ...r, undoable: false }))), resets));
    } catch {}
    setRecentReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (!recentReady) return;
    try {
      // what this page doesn't show stays saved for the login that does
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
      const others = Array.isArray(saved) ? saved.filter((r) => r && !rosterIds.has(r.camperId) && Date.now() - r.at < RECENT_KEEP_MS) : [];
      localStorage.setItem(RECENT_KEY, JSON.stringify(mergeRecent(recent, others)));
    } catch {}
  }, [recent, recentReady, rosterIds]);
  React.useEffect(() => {
    const load = () =>
      recentScansAndResets()
        .then(({ scans: list, resets: resetAt }) =>
          setRecent((cur) =>
            sinceReset(
              mergeRecent(
                cur,
                list.map((r) => ({ key: r.eventId, camperId: r.camperId, name: hebOf.get(r.camperId) ?? r.name, verb: r.verb, tone: r.tone, eventId: r.eventId, at: Date.parse(r.at), undone: r.undone, undoable: r.undoable, by: r.by })),
              ),
              resetAt,
            ),
          ),
        )
        .catch(() => undefined);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [hebOf, sinceReset]);

  // the page is the camera: it fills the space between the app's bars and doesn't scroll
  const frame = useFullFrame();
  const [sheet, setSheet] = React.useState(false);
  const touch = React.useRef<number | null>(null);
  const openCard = (id: string) => {
    setFlash(null);
    setCard(id);
  };

  // the last scan's result, over the picture under the name bar
  const flashView = flash ? (
    <div className={cn("pointer-events-auto flex w-full flex-col gap-1.5 rounded-2xl px-4 py-3 text-left shadow-xl", FLASH[flash.tone])} role="status">
      <button type="button" className="min-w-0 text-left" onClick={() => (setFlash(null), focusBox())}>
        <span className="block truncate text-xl font-bold leading-tight" dir="auto">
          {flash.title}
        </span>
        <span className="block text-sm font-medium opacity-90" dir="auto">
          {flash.detail}
          {flash.ask ? ". Check them out?" : ""}
        </span>
      </button>
      {(flash.ask || flash.labels) && (
        <span className="flex flex-wrap gap-2">
          {flash.ask && (
            <Button size="sm" className="bg-status-out text-amber-950 hover:bg-status-out/90" onClick={() => void checkOutNow(flash.ask!)}>
              <LogOut /> Check out · coming back
            </Button>
          )}
          {flash.labels && (
            <Button size="sm" variant="secondary" onClick={() => openCard(flash.labels!.id)}>
              <Tag /> Labels
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => (setFlash(null), focusBox())}>
            {flash.ask ? "No" : "Close"}
          </Button>
        </span>
      )}
    </div>
  ) : null;
  const tint = flash ? FLASH_RING[flash.tone] : final ? "ring-status-departed/60" : mode === "in" ? "ring-status-present/60" : mode === "out" ? "ring-status-out" : "ring-transparent";
  const toggleSound = () => {
    const v = !sound;
    setSound(v);
    try {
      localStorage.setItem("kinus:sound", v ? "on" : "off");
    } catch {}
    if (v) {
      unlockSound();
      feedback("ok");
    }
  };
  // the recent list: just the camp being looked at (an owner switching camps sees that camp's)
  const divOf = new Map([...roster, ...extra].map((r) => [r.id, r.div]));
  const shown = campDivisionIds ? recent.filter((r) => !divOf.has(r.camperId) || campDivisionIds.includes(divOf.get(r.camperId) ?? "")) : recent;
  const latest = shown[0];

  return (
    <div
      className="fixed z-20 overflow-hidden bg-neutral-950"
      style={{ top: frame.top, bottom: frame.bottom, left: frame.left, right: 0 }}
      // the first tap wakes the sound up, so scans after it beep (phones need a tap first)
      onPointerDown={unlockSound}
    >
      {/* the camera, the whole page */}
      {camera ? (
        <Camera onCode={onCameraCode} onTurnOff={neverCamera} fill />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/70">
          <CameraOff className="size-8" />
          <p>The camera is off. A handheld scanner still works, or type a name.</p>
          <Button variant="secondary" onClick={() => setCameraOn(true)}>
            <CameraIcon /> Start camera
          </Button>
        </div>
      )}
      {/* the mode's colour round the edge; a result's colour for a moment */}
      <div className={cn("pointer-events-none absolute inset-0 z-10 ring-[6px] ring-inset transition-[box-shadow] duration-150", tint)} />

      {/* on top: what a scan does, the name bar, the result */}
      <div className="absolute inset-x-0 top-0 z-20 space-y-2 bg-gradient-to-b from-black/60 via-black/25 to-transparent p-3 pb-6">
        {final ? (
          <div className="flex items-center gap-3 rounded-xl bg-status-departed px-4 py-2.5 text-white shadow-lg">
            <DoorOpen className="size-5 shrink-0" />
            <span className="min-w-0 truncate text-sm font-semibold">Final check-out · {final.campName}: a scan checks the camper out, going home</span>
          </div>
        ) : canScan ? (
          <div className="flex gap-1 rounded-xl bg-background/85 p-1 shadow-lg backdrop-blur" role="tablist" aria-label="What a scan does">
            {(
              [
                ["in", "Check in", LogIn, "text-status-present ring-status-present"],
                ["out", "Check out", LogOut, "text-amber-700 ring-status-out dark:text-amber-300"],
                ["lookup", "Look up", Search, "text-foreground ring-primary"],
              ] as const
            ).map(([m, label, Icon, on]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => choose(m)}
                className={cn(
                  "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold whitespace-nowrap transition-colors",
                  mode === m ? cn("bg-background shadow-sm ring-2", on) : "text-muted-foreground hover:bg-background/60",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-background/85 px-3 py-2 text-sm text-muted-foreground shadow-lg backdrop-blur">Scanning or typing a name opens the camper. Your account can look campers up, not check them in.</p>
        )}
        {mode === "out" && !final && <p className="rounded-lg bg-status-out px-3 py-1 text-center text-xs font-semibold text-amber-950 shadow">Checking OUT: they&apos;ll come back. Going home is Final check-out.</p>}

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
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
                if (matches.length === 1 && !similar.has(matches[0].id)) act(matches[0], "manual");
                else if (!matches.length && looksLikeScan(q)) unreadable(q);
              }}
              placeholder={final ? `Type a name in ${final.campName}` : "Type a name"}
              className="h-12 border-0 bg-background/90 pl-11 pr-10 text-base shadow-lg backdrop-blur"
              dir="auto"
              aria-label="Type a name or code"
            />
            {q && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground" onClick={() => (setQ(""), focusBox())} aria-label="Clear">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button size="icon" variant="secondary" className="size-12 shrink-0 bg-background/85 shadow-lg backdrop-blur" onClick={toggleSound} aria-label={sound ? "Turn sound off" : "Turn sound on"}>
            {sound ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button size="icon" variant="secondary" className="size-12 shrink-0 bg-background/85 shadow-lg backdrop-blur" onClick={() => setCameraOn(!camera)} aria-label={camera ? "Stop camera" : "Start camera"}>
            {camera ? <CameraOff /> : <CameraIcon />}
          </Button>
        </div>

        {/* names that match, over the picture */}
        {(matches.length > 0 || (needle.length >= 2 && !findScanCode(q))) && (
          <div className="max-h-[45dvh] overflow-y-auto rounded-xl bg-card shadow-xl">
            {matches.length > 0 ? (
              <ul className="divide-y">
                {matches.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => act(r, "manual")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" dir="auto">
                          {r.heb ?? r.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground" dir="auto">
                          {r.heb && <span className="mr-1">{r.name} ·</span>}
                          {similar.has(r.id) && <span className="mr-1 rounded bg-muted px-1.5 py-0.5 font-medium">Similar name</span>}
                          {multi && line && line !== ANY && r.div !== line && <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Other line</span>}
                          {r.where} · {r.code}
                        </span>
                      </span>
                      <StatusBadge status={statuses[r.id] ?? r.status} />
                    </button>
                  </li>
                ))}
                {allMatches.length > matches.length && <li className="px-4 py-2 text-xs text-muted-foreground">{allMatches.length - matches.length} more: type more of the name.</li>}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">No camper {final ? `in ${final.campName}` : "in your area"} matches “{q}”.</p>
            )}
          </div>
        )}

        {/* which line, and the labels to print (people who use the print queue) */}
        {((multi && canScan && mode !== "lookup" && line) || printQueue) && !q && (
          <div className="flex flex-wrap items-center gap-2">
            {multi && canScan && mode !== "lookup" && line && (
              <button
                type="button"
                onClick={() => chooseLine(null)}
                className="flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-white shadow-lg"
                style={{ background: lineDiv?.color ?? "rgb(0 0 0 / 0.6)" }}
                title="Change the line"
              >
                <span className="truncate" dir="auto">
                  {lineDiv ? `Line: ${lineDiv.name}` : "Any division"}
                </span>
                <span className="text-xs font-normal opacity-80">Change</span>
              </button>
            )}
            {printQueue && (
              <Button size="sm" variant="secondary" className="ml-auto bg-background/85 shadow-lg backdrop-blur" asChild>
                <Link href={lineDiv ? `/print?division=${lineDiv.id}` : "/print"}>
                  <Printer /> Labels to print
                </Link>
              </Button>
            )}
          </div>
        )}

        <div aria-live="assertive">{!q && flashView}</div>
      </div>

      {/* which line: asked once a shift, over everything */}
      {multi && canScan && mode !== "lookup" && !line && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md">
            <LineBar divisions={divisions} line={line} lineDiv={lineDiv} onChoose={chooseLine} />
          </div>
        </div>
      )}

      {/* at the bottom: the last 50, peeking; pull up (or tap) to see them, undo, or open one */}
      {(shown.length > 0 || final) && (
        <section
          className={cn("absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-card shadow-[0_-8px_24px_rgb(0_0_0/0.25)] transition-[height] duration-200", sheet ? "h-[70%]" : "h-16")}
          onTouchStart={(e) => (touch.current = e.touches[0].clientY)}
          onTouchEnd={(e) => {
            if (touch.current === null) return;
            const dy = e.changedTouches[0].clientY - touch.current;
            touch.current = null;
            if (dy < -30) setSheet(true);
            else if (dy > 30) setSheet(false);
          }}
        >
          <button type="button" className="flex h-16 shrink-0 items-center gap-3 px-4 text-left" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>
            <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{final ? "Going home" : `Recent · ${shown.length}`}</span>
              {latest ? (
                <span className="block truncate text-sm" dir="auto">
                  <span className={cn("font-medium", latest.undone && "line-through opacity-60")}>{latest.name}</span> · {latest.undone ? "Undone" : latest.verb} · {formatTime(new Date(latest.at).toISOString())}
                </span>
              ) : (
                <span className="block text-sm text-muted-foreground">Nobody yet</span>
              )}
            </span>
            <ChevronUp className={cn("size-5 text-muted-foreground transition-transform", sheet && "rotate-180")} />
          </button>
          {sheet && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
              {final && (
                <div className="p-3">
                  <CheckoutProgress campName={final.campName} divisions={final.divisions} roster={[...roster, ...extra]} statuses={statuses} />
                </div>
              )}
              <ul className="divide-y">
                {shown.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 px-4 py-2.5">
                    <button className="min-w-0 flex-1 text-left disabled:cursor-default" disabled={Boolean(final)} onClick={() => openCard(r.camperId)}>
                      <span className={cn("block truncate font-medium", r.undone && "line-through opacity-60")} dir="auto">
                        {r.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.undone ? "Undone" : r.verb} · {formatTime(new Date(r.at).toISOString())}
                        {r.by && ` · ${r.by}`}
                      </span>
                    </button>
                    {r.eventId && !r.undone && r.undoable !== false && Date.now() - r.at < UNDO_MS && (
                      <Button size="sm" variant="outline" onClick={() => undo(r)}>
                        <Undo2 /> Undo
                      </Button>
                    )}
                    {!final && templates.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => openCard(r.camperId)} aria-label={`Labels for ${r.name}`}>
                        <Tag /> Labels
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
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
                  {wrong.r.heb ?? wrong.r.name}
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

      {/* a camper: looked up, tapped in the list, or scanned again for labels */}
      <Dialog open={!final && Boolean(card)} onOpenChange={(o) => !o && (setCard(null), focusBox())}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="sr-only">Camper</DialogTitle>
          </DialogHeader>
          {card && <CamperCard camperId={card} templates={templates} canScan={canScan} onAction={(o) => setStatuses((s) => ({ ...s, [o.camperId]: o.status }))} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Where the check-in page goes: everything between the app's top bar and its bottom tabs
 * (on a phone), or beside the side menu (a computer). The page itself doesn't scroll.
 */
function useFullFrame() {
  const [box, setBox] = React.useState({ top: 0, bottom: 0, left: 0 });
  React.useLayoutEffect(() => {
    const measure = () => {
      const rect = (sel: string) => {
        const el = document.querySelector(sel);
        const r = el?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0 ? r : null;
      };
      const header = rect("[data-app-header]");
      const tabs = rect("[data-app-tabbar]");
      const side = rect("[data-app-sidebar]");
      setBox({ top: header ? Math.max(0, header.bottom) : 0, bottom: tabs ? Math.max(0, window.innerHeight - tabs.top) : 0, left: side ? side.right : 0 });
    };
    measure();
    window.addEventListener("resize", measure);
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    window.scrollTo(0, 0);
    return () => {
      window.removeEventListener("resize", measure);
      html.style.overflow = before;
    };
  }, []);
  return box;
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

/**
 * The list from two places (this device, the server) as one, newest first: the server's
 * copy of a check-in wins (it knows whether it was undone since), and "already" entries
 * (not recorded on the server) stay.
 */
function mergeRecent(cur: Recent[], incoming: Recent[]): Recent[] {
  const byKey = new Map(cur.map((r) => [r.key, r]));
  for (const r of incoming) {
    const had = byKey.get(r.key);
    // an undo made here before the server's list caught up stays undone
    byKey.set(r.key, had ? { ...had, ...r, undone: Boolean(had.undone || r.undone) } : r);
  }
  return [...byKey.values()].sort((x, y) => y.at - x.at).slice(0, RECENT_MAX);
}
