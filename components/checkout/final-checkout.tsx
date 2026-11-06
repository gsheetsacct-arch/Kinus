"use client";
import * as React from "react";
import { toast } from "sonner";
import {
  BellRing,
  ChevronUp,
  ScanLine,
  Search,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Scanner,
  useFullFrame,
  type RosterEntry,
} from "@/components/scan/scanner";
import { checkoutState, setCalled } from "@/app/(app)/checkout/actions";
import {
  findFamilies,
  findIndex,
  standingOf,
  type FamilyGroup,
} from "@/lib/checkout/find";
import { formatBuzzer } from "@/lib/buzzer-format";
import type { CamperStatus } from "@/lib/attendance/machine";
import { cn, formatTime } from "@/lib/utils";

/** A camper on Final check-out: the scanner's roster entry, with their family (the export's family id) and where they're from. */
export type CheckoutCamper = RosterEntry & {
  family: string | null;
  from: string;
};
type Division = { id: string; name: string; color: string | null };
type Tab = "find" | "called" | "scan";

const TABS_H = 48;
const TAB_KEY = "kinus:checkout-tab";

/**
 * Final check-out in three tabs. Find: look a camper up (smart search: any order, sounds-like,
 * typos, code or buzzer number), with their family together; tapping a name marks them called
 * (their parent is here), or "Call all" for the family. Called: everyone called and not gone
 * home yet, newest first, with "Not called" to undo. Scanner: scanning their tag (or typing its
 * number) is what checks them out, going home. Called is shared by every final check-out phone.
 */
export function FinalCheckout({
  roster,
  campName,
  divisions,
  initialCalls,
}: {
  roster: CheckoutCamper[];
  campName: string;
  divisions: Division[];
  initialCalls: Record<string, string>;
}) {
  const [tab, setTab] = React.useState<Tab>("find");
  const [statuses, setStatuses] = React.useState<Record<string, CamperStatus>>(
    () => Object.fromEntries(roster.map((r) => [r.id, r.status])),
  );
  const [calls, setCalls] =
    React.useState<Record<string, string>>(initialCalls);
  React.useEffect(() => {
    try {
      const t = localStorage.getItem(TAB_KEY);
      if (t === "find" || t === "called" || t === "scan") setTab(t);
    } catch {}
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  };
  // statuses and calls from every phone, every few seconds while on screen: only the campers
  // changed since the last time (the page already has everyone)
  const since = React.useRef<string | undefined>(
    new Date(Date.now() - 60_000).toISOString(),
  );
  const busy = React.useRef(false);
  const refresh = React.useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    checkoutState(since.current)
      .then((s) => {
        since.current = s.asOf;
        setStatuses((cur) => ({ ...cur, ...s.statuses }));
        setCalls(s.calls);
      })
      .catch(() => undefined)
      .finally(() => (busy.current = false));
  }, []);
  React.useEffect(() => {
    const t = setInterval(
      () => document.visibilityState === "visible" && refresh(),
      8000,
    );
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const campers = React.useMemo(
    () => roster.map((r) => ({ ...r, status: statuses[r.id] ?? r.status })),
    [roster, statuses],
  );
  const byId = React.useMemo(
    () => new Map(campers.map((c) => [c.id, c])),
    [campers],
  );
  // everyone called, newest first; those scanned out stay on the list, marked so
  const called = React.useMemo(
    () =>
      Object.entries(calls)
        .map(([id, at]) => ({ c: byId.get(id), at }))
        .filter((x): x is { c: CheckoutCamper; at: string } => Boolean(x.c))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [calls, byId],
  );

  // still waiting (called, not scanned out yet): the count on the tab and the bar
  const waiting = called.filter(
    (x) => standingOf(x.c.status) !== "gone",
  ).length;

  const mark = React.useCallback(
    async (ids: string[], on: boolean) => {
      if (!ids.length) return;
      const before = calls;
      const now = new Date().toISOString();
      // at once on screen; the server's answer (every phone's calls) follows
      setCalls((cur) => {
        const next = { ...cur };
        for (const id of ids) {
          if (on) next[id] ??= now;
          else delete next[id];
        }
        return next;
      });
      const r = await setCalled(ids, on).catch(() => ({
        ok: false as const,
        error: "That didn't go through. Check the connection and try again.",
      }));
      if (!r.ok) {
        setCalls(before);
        toast.error(r.error);
        return;
      }
      setCalls(r.calls);
    },
    [calls],
  );

  const frame = useFullFrame();
  const tabBar = (
    <div
      className="fixed z-40 flex border-b bg-background"
      style={{ top: frame.top, left: frame.left, right: 0, height: TABS_H }}
      role="tablist"
    >
      {(
        [
          ["find", "Find", Search],
          ["called", `Called${waiting ? ` · ${waiting}` : ""}`, BellRing],
          ["scan", "Scanner", ScanLine],
        ] as const
      ).map(([t, label, Icon]) => (
        <button
          key={t}
          role="tab"
          aria-selected={tab === t}
          onClick={() => choose(t)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 border-b-2 text-sm font-semibold",
            tab === t
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground",
          )}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  );

  if (tab === "scan")
    return (
      <>
        {tabBar}
        <Scanner
          roster={roster}
          templates={[]}
          canScan
          final={{ campName, divisions }}
          offsetTop={TABS_H}
        />
      </>
    );
  return (
    <>
      {tabBar}
      <div
        className="fixed z-20 flex flex-col overflow-hidden bg-background"
        style={{
          top: frame.top + TABS_H,
          bottom: frame.bottom,
          left: frame.left,
          right: 0,
        }}
      >
        {tab === "find" ? (
          <FindTab
            campers={campers}
            calls={calls}
            called={called}
            campName={campName}
            onCall={(ids) => mark(ids, true)}
            onUncall={(ids) => mark(ids, false)}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <CalledList
              called={called}
              onUncall={(id) => mark([id], false)}
              empty="Nobody's been called yet. Tap a name on Find to call them."
            />
          </div>
        )}
      </div>
    </>
  );
}

function FindTab({
  campers,
  calls,
  called,
  campName,
  onCall,
  onUncall,
}: {
  campers: CheckoutCamper[];
  calls: Record<string, string>;
  called: { c: CheckoutCamper; at: string }[];
  campName: string;
  onCall: (ids: string[]) => void;
  onUncall: (ids: string[]) => void;
}) {
  const [q, setQ] = React.useState("");
  const [sheet, setSheet] = React.useState(false);
  const touch = React.useRef<number | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, []);
  // only campers with a buzzer number: those without are in a camp or program with no buzzers
  // (Virtual, the Thursday Program), so they're never looked up here; nor shown in a family
  const index = React.useMemo(() => findIndex(campers.filter((c) => c.buzzer !== null && c.buzzer !== undefined)), [campers]);
  const deferred = React.useDeferredValue(q);
  const groups = React.useMemo(
    () => findFamilies(index, deferred),
    [index, deferred],
  );
  const latest = called[0];
  const waitingCount = called.filter(
    (x) => standingOf(x.c.status) !== "gone",
  ).length;
  const call = (c: CheckoutCamper) => {
    const s = standingOf(c.status);
    if (s === "never")
      return void toast(
        `${c.name} never checked in, so there's nothing to check out.`,
      );
    if (s === "gone") return void toast(`${c.name} was already scanned out.`);
    if (calls[c.id])
      return void toast(
        `${c.name} was called at ${formatTime(calls[c.id])}. Undo it on Called.`,
      );
    onCall([c.id]);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Name, code or buzzer number · ${campName}`}
            className="h-12 w-full rounded-xl border bg-background pl-9 pr-10 text-base outline-none focus:ring-2 focus:ring-primary/40"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            dir="auto"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Clear"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-24 pt-3">
        {!q.trim() ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            Type the name the parent asks for (any order, misspelled is fine),
            the camper&apos;s code or buzzer number. Their brothers and sisters
            show with them. Tap a name to call them.
          </p>
        ) : !groups.length ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            Nobody in {campName} matches “{q}”.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <FamilyCard
                key={g.key}
                group={g}
                calls={calls}
                onCall={call}
                onCallAll={(ids) => onCall(ids)}
              />
            ))}
          </div>
        )}
      </div>

      {/* at the bottom: who's been called, peeking; pull up (or tap) to see them all */}
      <section
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t bg-card shadow-[0_-8px_24px_rgb(0_0_0/0.15)] transition-[height] duration-200",
          sheet ? "h-[70%]" : "h-16",
        )}
        onTouchStart={(e) => (touch.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dy = e.changedTouches[0].clientY - touch.current;
          touch.current = null;
          if (dy < -30) setSheet(true);
          else if (dy > 30) setSheet(false);
        }}
      >
        <button
          type="button"
          className="relative flex h-16 shrink-0 items-center gap-3 px-4 text-left"
          onClick={() => setSheet(!sheet)}
          aria-expanded={sheet}
        >
          <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Called · {waitingCount} waiting
              {called.length > waitingCount
                ? ` · ${called.length - waitingCount} scanned out`
                : ""}
            </span>
            {latest ? (
              <span className="block truncate text-sm" dir="auto">
                <span className="font-medium">{latest.c.name}</span>
                {latest.c.buzzer
                  ? ` · ${formatBuzzer(latest.c.buzzer)}`
                  : ""} · {formatTime(latest.at)}
              </span>
            ) : (
              <span className="block text-sm text-muted-foreground">
                Nobody yet
              </span>
            )}
          </span>
          <ChevronUp
            className={cn(
              "size-5 text-muted-foreground transition-transform",
              sheet && "rotate-180",
            )}
          />
        </button>
        {sheet && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
            <CalledList
              called={called}
              onUncall={(id) => onUncall([id])}
              empty="Nobody's been called yet."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function FamilyCard({
  group,
  calls,
  onCall,
  onCallAll,
}: {
  group: FamilyGroup<CheckoutCamper>;
  calls: Record<string, string>;
  onCall: (c: CheckoutCamper) => void;
  onCallAll: (ids: string[]) => void;
}) {
  const family = group.members.length > 1;
  const toCall = group.members.filter(
    (c) => standingOf(c.status) === "here" && !calls[c.id],
  );
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        !group.anyHere && "opacity-60",
      )}
    >
      {family && (
        <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
          <Users className="size-4 shrink-0 text-muted-foreground" />
          <span
            className="min-w-0 flex-1 truncate text-sm font-semibold"
            dir="auto"
          >
            {familyName(group.members)} family · {group.members.length}
          </span>
          {toCall.length > 0 && (
            <Button
              size="sm"
              onClick={() => onCallAll(toCall.map((c) => c.id))}
            >
              <BellRing />{" "}
              {toCall.length === group.members.length
                ? `Call all ${toCall.length}`
                : `Call the ${toCall.length} here`}
            </Button>
          )}
        </div>
      )}
      <ul className="divide-y">
        {group.members.map((c) => (
          <CamperRow
            key={c.id}
            c={c}
            calledAt={calls[c.id]}
            onTap={() => onCall(c)}
          />
        ))}
      </ul>
    </div>
  );
}

/** The family's last name, or the names when they differ. */
function familyName(members: CheckoutCamper[]) {
  const lasts = [...new Set(members.map((m) => m.last.trim()))];
  return lasts.length === 1 ? lasts[0] : lasts.slice(0, 2).join(" / ");
}

function CamperRow({
  c,
  calledAt,
  onTap,
}: {
  c: CheckoutCamper;
  calledAt?: string;
  onTap: () => void;
}) {
  const s = standingOf(c.status);
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted",
          s === "never" && "opacity-50",
          calledAt && s === "here" && "bg-amber-50 dark:bg-amber-950/40",
        )}
      >
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-lg font-semibold leading-tight"
            dir="auto"
          >
            {c.name}
            {c.heb && (
              <span className="ml-2 font-normal text-muted-foreground">
                {c.heb}
              </span>
            )}
          </span>
          <span
            className="block truncate text-xs text-muted-foreground"
            dir="auto"
          >
            {[c.where, c.from].filter(Boolean).join(" · ")}
          </span>
          <span className="mt-0.5 block text-xs font-medium">
            {s === "never" ? (
              <span className="text-muted-foreground">Never checked in</span>
            ) : s === "gone" ? (
              <span className="text-status-present">Scanned out</span>
            ) : calledAt ? (
              <span className="text-amber-700 dark:text-amber-300">
                Called · {formatTime(calledAt)}
              </span>
            ) : (
              <span className="text-muted-foreground">Tap to call</span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Buzzer
          </span>
          <span className="block text-2xl font-bold tabular-nums">
            {c.buzzer ? formatBuzzer(c.buzzer) : "—"}
          </span>
        </span>
      </button>
    </li>
  );
}

function CalledList({
  called,
  onUncall,
  empty,
}: {
  called: { c: CheckoutCamper; at: string }[];
  onUncall: (id: string) => void;
  empty: string;
}) {
  if (!called.length)
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  return (
    <ul className="divide-y">
      {called.map(({ c, at }) => {
        const out = standingOf(c.status) === "gone";
        return (
          <li
            key={c.id}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5",
              out && "bg-muted/40",
            )}
          >
            <span
              className={cn(
                "w-14 shrink-0 text-xl font-bold tabular-nums",
                out && "text-muted-foreground",
              )}
            >
              {c.buzzer ? formatBuzzer(c.buzzer) : "—"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold" dir="auto">
                {c.name}
                {c.heb && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {c.heb}
                  </span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground" dir="auto">
                Called {formatTime(at)} · {c.where}
                {c.from ? ` · ${c.from}` : ""}
              </span>
            </span>
            {out ? (
              <span className="shrink-0 rounded-full bg-status-present/15 px-2.5 py-1 text-xs font-semibold text-status-present">
                Scanned out
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 px-2"
                onClick={() => onUncall(c.id)}
                title="Called by mistake"
              >
                <Undo2 /> <span className="hidden sm:inline">Not called</span>
                <span className="sm:hidden">Undo</span>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
