"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortenCamperCodes } from "@/app/(app)/print/actions";

/**
 * Campers who still have the long numbers (100016…): a button to give them short ones (0001…)
 * in division, bunk and name order. Shows only while someone has a long one.
 */
export function CodesBox({ long }: { long: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  if (!long) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <Hash className="size-5 text-muted-foreground" />
      <div className="min-w-0 flex-1 basis-60 text-sm">
        <p className="font-medium">Short camper numbers</p>
        <p className="text-muted-foreground">
          {long === 1 ? "1 camper still has" : `${long} campers still have`} a long number (like 100016). Short numbers (0001, 0002…) go in order of division, bunk and name; new campers get the next ones. Tags already printed with a long number still scan. Labels showing the number will come up as changed, to reprint.
        </p>
      </div>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Give ${long === 1 ? "this camper a short number" : `these ${long} campers short numbers`}? Their long numbers keep scanning, but labels and lists will show the new ones.`)) return;
          start(async () => {
            const r = await shortenCamperCodes().catch(() => ({ ok: false as const, error: "Couldn't do that: check the connection and try again." }));
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message ?? "Done.");
            router.refresh();
          });
        }}
      >
        {pending ? "Numbering…" : "Give short numbers"}
      </Button>
    </div>
  );
}
