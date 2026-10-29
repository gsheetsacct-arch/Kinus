"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { giveBuzzerNumbers } from "@/app/(app)/print/actions";
import { formatBuzzer } from "@/lib/buzzer-format";

/**
 * Buzzer (pager) numbers: how many have one, and a button to number the rest, in division,
 * bunk and name order after the highest so far. Nobody's number changes once given, unless
 * a director renumbers everyone (on purpose, after a warning: their labels print again).
 */
export function BuzzerBox({ have, without, highest }: { have: number; without: number; highest: number | null }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const give = (redo: boolean) =>
    start(async () => {
      const r = await giveBuzzerNumbers(redo).catch(() => ({ ok: false as const, error: "Couldn't do that: check the connection and try again." }));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Done.");
      router.refresh();
    });
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <BellRing className="size-5 text-muted-foreground" />
      <div className="min-w-0 flex-1 basis-60 text-sm">
        <p className="font-medium">Buzzer numbers</p>
        <p className="text-muted-foreground">
          {have ? `${have} have one${highest ? ` (up to ${formatBuzzer(highest)})` : ""}` : "Nobody has one yet"}
          {without ? `, ${without} don't yet.` : "."} New numbers go in order of division, bunk and name, after the highest so far. Whoever has a number keeps it, also after moving bunk (their label reprints with the same number). Buzzer labels print only for campers with a number.
        </p>
      </div>
      {without > 0 && (
        <Button variant="outline" disabled={pending} onClick={() => give(false)}>
          {pending ? "Numbering…" : `Number the ${without} without one`}
        </Button>
      )}
      {have > 0 && (
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            confirm(
              `Renumber all ${have + without} campers from ${formatBuzzer(1)}, in division, bunk and name order? Campers who already have a number get a new one, so buzzer labels already printed or handed out no longer match: print them again.`,
            ) && give(true)
          }
        >
          Renumber everyone
        </Button>
      )}
    </div>
  );
}
