"use client";
import * as React from "react";
import { toast } from "sonner";
import { Loader2, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hands a PDF to the phone's share menu, to open in the NIIMBOT app (or any printing app).
 * Two taps: the first downloads it, the second opens the share menu (phones only open it
 * straight after a tap, and a big PDF takes longer than that to make). Where the browser
 * can't share files (most computers), the PDF just downloads.
 */
export function SharePdf({ href, label = "Open in NIIMBOT", onShared }: { href: string; label?: string; onShared?: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [canShare, setCanShare] = React.useState(false);
  React.useEffect(() => {
    try {
      setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] }));
    } catch {
      setCanShare(false);
    }
  }, []);
  // a different set (new labels came in): download again
  React.useEffect(() => setFile(null), [href]);
  if (!canShare) return null;

  const prepare = async () => {
    setBusy(true);
    try {
      const r = await fetch(href);
      if (!r.ok) throw new Error((await r.text()) || "Couldn't make the PDF.");
      const name = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get("Content-Disposition") ?? "")?.[1];
      setFile(new File([await r.blob()], name ? decodeURIComponent(name) : "labels.pdf", { type: "application/pdf" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make the PDF.");
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
      onShared?.();
    } catch (e) {
      // closing the share menu isn't an error
      if (!(e instanceof DOMException && e.name === "AbortError")) toast.error("The share menu didn't open. Tap again, or use the PDF button.");
    }
  };
  return file ? (
    <Button size="lg" onClick={share}>
      <Share /> {label}
    </Button>
  ) : (
    <Button size="lg" variant="outline" onClick={prepare} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Share />} {busy ? "Making the PDF…" : `Get ready for NIIMBOT`}
    </Button>
  );
}
