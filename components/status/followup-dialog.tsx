"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Followup } from "@/lib/attendance/missing";
import type { BoardRow } from "@/lib/data/board";
import { campDateTimeToIso, campHour, campToday } from "@/lib/time";
import { CAMP_TIME_ZONE } from "@/lib/utils";

export type FollowupDlg = { kind: "later" | "note" | "not_coming"; row: Pick<BoardRow, "id" | "name"> } | null;
type Dlg = FollowupDlg;

/** Coming later (a time, and a note), a note like "called mom", or not coming, for a camper not here yet. */
export function FollowupDialog({
  dlg,
  followup,
  onClose,
  onLater,
  onNote,
  onClear,
  onNotComing,
  pending,
}: {
  dlg: Dlg;
  followup: Followup | undefined;
  onClose: () => void;
  onLater: (id: string, until: string, note: string) => void;
  onNote: (id: string, note: string) => void;
  onClear: (id: string) => void;
  onNotComing: (id: string, reason: string) => void;
  pending: boolean;
}) {
  const [note, setNote] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [until, setUntil] = React.useState("");
  React.useEffect(() => {
    if (!dlg) return;
    setNote(followup?.note ?? "");
    setUntil("");
    // two hours from now, on whatever day that is at camp (10 pm + 2 h is tomorrow)
    const later = new Date(Date.now() + 2 * 3600000);
    setDate(campToday(later));
    setTime(later.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: CAMP_TIME_ZONE }));
  }, [dlg, followup]);
  if (!dlg) return null;
  const id = dlg.row.id;
  const inHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
  const tomorrow = campToday(new Date(Date.now() + 24 * 3600000));
  const quick: { label: string; until: string }[] = [
    { label: "In 1 hour", until: inHours(1) },
    { label: "In 2 hours", until: inHours(2) },
    { label: "This evening", until: campDateTimeToIso(campToday(), "18:00") },
    // in the small hours, "morning" is today's
    campHour() < 6 ? { label: "This morning", until: campDateTimeToIso(campToday(), "09:00") } : { label: "Tomorrow morning", until: campDateTimeToIso(tomorrow, "09:00") },
  ].filter((q) => new Date(q.until) > new Date());
  const laterIso = until === "custom" ? (date && time ? campDateTimeToIso(date, time) : "") : until;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle dir="auto">
            {dlg.kind === "later" ? "Coming later" : dlg.kind === "note" ? "Note" : "Not coming"}: {dlg.row.name}
          </DialogTitle>
          <DialogDescription>
            {dlg.kind === "later" && "They stay on the list, but aren't flagged until this time."}
            {dlg.kind === "note" && "What you found out, for everyone who looks after this camper."}
            {dlg.kind === "not_coming" && "They're taken off the not-here-yet list and counted as not coming. You can undo this."}
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1.5 text-sm">
          <span className="block font-medium">{dlg.kind === "not_coming" ? "Why (optional)" : dlg.kind === "later" ? "Note (optional)" : "Note"}</span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={dlg.kind === "not_coming" ? "e.g. sick this week, cancelled" : "e.g. Called mom: flight lands at 3"}
            dir="auto"
            autoFocus
          />
        </label>
        {dlg.kind === "later" && (
          <div className="space-y-2 text-sm">
            <span className="block font-medium">Expect them</span>
            <div className="flex flex-wrap gap-2">
              {quick.map((x) => (
                <Button key={x.label} type="button" variant={until === x.until ? "default" : "outline"} size="sm" aria-pressed={until === x.until} onClick={() => setUntil(x.until)}>
                  {x.label}
                </Button>
              ))}
              <Button type="button" variant={until === "custom" ? "default" : "outline"} size="sm" aria-pressed={until === "custom"} onClick={() => setUntil("custom")}>
                Pick a time
              </Button>
            </div>
            {until === "custom" && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1">
                  <span className="block text-xs text-muted-foreground">Day</span>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-muted-foreground">Time</span>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 w-32" />
                </label>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          {dlg.kind !== "not_coming" && followup ? (
            <Button variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => onClear(id)}>
              Clear note and time
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {dlg.kind === "note" && (
              <Button disabled={pending || !note.trim()} onClick={() => onNote(id, note)}>
                Save note
              </Button>
            )}
            {dlg.kind === "later" && (
              <Button disabled={pending || !laterIso} onClick={() => laterIso && onLater(id, laterIso, note)}>
                Save
              </Button>
            )}
            {dlg.kind === "not_coming" && (
              <Button variant="destructive" disabled={pending} onClick={() => onNotComing(id, note)}>
                Not coming
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
