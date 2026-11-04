"use client";
import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, FileDown, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The NIIMBOT label printer app: Android opens it by its package, iPhones through the App Store page (its Open button). */
const NIIMBOT_ANDROID = "intent://#Intent;package=com.gengcon.android.jccloudprinter;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.gengcon.android.jccloudprinter;end";
const NIIMBOT_IOS = "https://apps.apple.com/app/id1359104615";
/**
 * Android's Downloads list: tapping the PDF there opens it, and Android offers the apps that
 * print it, NIIMBOT among them (sharing the file doesn't list NIIMBOT; opening it does).
 */
const ANDROID_DOWNLOADS = "intent:#Intent;action=android.intent.action.VIEW_DOWNLOADS;end";

export const phoneOf = () => {
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
  if (done) return <OpenOnPhone phone={phone} size={size} again={() => setDone(false)} />;
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
 * After a PDF is downloaded on a phone: on Android, "Open the PDF" (the Downloads list: tap the
 * file and Android offers NIIMBOT to print it) and "Open NIIMBOT"; on an iPhone, "Open NIIMBOT"
 * (pick the file there).
 */
export function OpenOnPhone({ phone, size = "lg", again }: { phone: "android" | "ios"; size?: "lg" | "default" | "sm"; again?: () => void }) {
  return (
    <span className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        {phone === "android" && (
          <Button size={size} asChild>
            <a href={ANDROID_DOWNLOADS}>
              <FileText /> Open the PDF
            </a>
          </Button>
        )}
        <Button size={size} variant={phone === "android" ? "outline" : "default"} asChild>
          <a href={phone === "android" ? NIIMBOT_ANDROID : NIIMBOT_IOS}>
            <ExternalLink /> Open NIIMBOT
          </a>
        </Button>
        {again && (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={again}>
            Download again
          </button>
        )}
      </span>
      {phone === "android" && (
        <span className="text-xs text-muted-foreground">Tap the PDF in Downloads (or Open in the download bar) and choose NIIMBOT: open it, don&apos;t share it. Not offered? Open NIIMBOT and print the PDF from there.</span>
      )}
    </span>
  );
}
