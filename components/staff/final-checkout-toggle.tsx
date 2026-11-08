"use client";
import * as React from "react";
import { DoorOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setFinalCheckout } from "@/app/(app)/admin/users/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Final check-out on or off for a check-in helper (their page on Staff). */
export function FinalCheckoutToggle({ id, on, canChange }: { id: string; on: boolean; canChange: boolean }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  return (
    <Button
      variant={on ? "default" : "outline"}
      className={cn(on && "bg-status-departed text-white hover:bg-status-departed/90")}
      disabled={busy || !canChange}
      aria-pressed={on}
      onClick={() =>
        start(async () => {
          const r = await setFinalCheckout(id, !on);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message);
          router.refresh();
        })
      }
    >
      <DoorOpen /> {busy ? "Saving…" : on ? "Final check-out: on" : "Turn on final check-out"}
    </Button>
  );
}
