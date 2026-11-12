"use client";
import * as React from "react";
import { Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setTextingOff } from "@/app/(app)/messages/actions";
import { Button } from "@/components/ui/button";

/** The owner's kill switch for texting (Text staff). */
export function TextingSwitch({ off }: { off: boolean }) {
  const router = useRouter();
  const [busy, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant={off ? "default" : "outline"}
      className={off ? "" : "border-destructive/40 text-destructive hover:bg-destructive/10"}
      disabled={busy}
      onClick={() =>
        start(async () => {
          if (!off && !window.confirm("Turn texting off? Nobody can send texts until you turn it back on.")) return;
          const r = await setTextingOff(!off);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message);
          router.refresh();
        })
      }
    >
      <Power /> {busy ? "Saving…" : off ? "Turn texting back on" : "Turn texting off"}
    </Button>
  );
}
