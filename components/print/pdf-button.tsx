"use client";
import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The NIIMBOT label printer app: Android opens it by its package, iPhones through the App Store page (its Open button). */
const NIIMBOT_ANDROID = "intent://#Intent;package=com.gengcon.android.jccloudprinter;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.gengcon.android.jccloudprinter;end";
const NIIMBOT_IOS = "https://apps.apple.com/app/id1359104615";

const phoneOf = () => {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/android/i.test(ua)) return "android" as const;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document)) return "ios" as const;
  return null;
};

/**
 * Download a PDF. On a phone it then turns into "Open NIIMBOT", to print the file just
 * downloaded from the label printer's app (pick it there from Files / Downloads).
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
      <span className="flex flex-wrap items-center gap-2">
        <Button size={size} asChild>
          <a href={phone === "android" ? NIIMBOT_ANDROID : NIIMBOT_IOS}>
            <ExternalLink /> Open NIIMBOT
          </a>
        </Button>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setDone(false)}>
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
