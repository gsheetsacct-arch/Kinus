"use client";
import * as React from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const phoneOf = () => {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/android/i.test(ua)) return "android" as const;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document)) return "ios" as const;
  return null;
};

/**
 * Download a PDF. On a phone it then says how to print it on the label printer (NIIMBOT).
 */
export function PdfButton({ href, label, size = "lg", onDone }: { href: string; label: string; size?: "lg" | "default" | "sm"; onDone?: () => void }) {
  const [phone, setPhone] = React.useState<"android" | "ios" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  React.useEffect(() => setPhone(phoneOf()), []);
  React.useEffect(() => setDone(false), [href]);

  // on a computer: a plain download
  if (!phone)
    return (
      <Button size={size} variant="outline" asChild>
        <a href={href} onClick={onDone}>
          <FileDown /> {label}
        </a>
      </Button>
    );
  if (done)
    return (
      <span className="flex flex-col gap-1.5">
        <AfterDownload phone={phone} />
        <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => setDone(false)}>
          Download again
        </button>
      </span>
    );
  const download = async () => {
    setBusy(true);
    try {
      const r = await fetch(href);
      if (!r.ok) throw new Error((await r.text()) || "Couldn't make the PDF.");
      const name = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get("Content-Disposition") ?? "")?.[1];
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name ? decodeURIComponent(name) : "labels.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDone(true);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make the PDF.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size={size} variant="outline" onClick={download} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <FileDown />} {busy ? "Making the PDF…" : label}
    </Button>
  );
}

/**
 * What to do once the PDF is downloaded on a phone, to print it on the NIIMBOT label printer.
 * On Android, opening the PDF offers NIIMBOT; sharing it doesn't.
 */
export function AfterDownload({ phone }: { phone: "android" | "ios" }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-medium">Downloaded. To print it on the label printer:</p>
      {phone === "android" ? (
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Open</strong> the PDF: tap Open in the download bar, or find it in Files → Downloads. Don&apos;t share it: sharing doesn&apos;t list NIIMBOT.
          </li>
          <li>Choose NIIMBOT and print.</li>
          <li>NIIMBOT not offered? Open the NIIMBOT app and print the PDF from there.</li>
        </ol>
      ) : (
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
          <li>Open the NIIMBOT app.</li>
          <li>Pick the PDF (Files → Downloads) and print.</li>
        </ol>
      )}
    </div>
  );
}
