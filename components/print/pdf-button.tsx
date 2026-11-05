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

const token = () => Math.random().toString(36).slice(2, 12).padEnd(6, "0");
const readCookie = (name: string) => document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
const dropCookie = (name: string) => (document.cookie = `${name}=; path=/; max-age=0`);

/**
 * Download a PDF: a plain link the browser downloads itself, on the tap (a download started
 * later, after fetching the file in the page, is quietly blocked by phone browsers). While the
 * PDF is being made it says so; the server tells it (a short cookie, see the combined PDF route)
 * when the download starts, or that it failed. On a phone it then says how to print it on the
 * label printer (NIIMBOT).
 */
export function PdfButton({ href, label, size = "lg", onDone }: { href: string; label: string; size?: "lg" | "default" | "sm"; onDone?: () => void }) {
  const [phone, setPhone] = React.useState<"android" | "ios" | null>(null);
  const [done, setDone] = React.useState(false);
  const [making, setMaking] = React.useState<string | null>(null);
  const [tok, setTok] = React.useState(token);
  React.useEffect(() => setPhone(phoneOf()), []);
  React.useEffect(() => setDone(false), [href]);
  // waiting for the server's word that the download started (or failed); 3 minutes at most,
  // and shown for a moment at least so a quick one is seen too
  React.useEffect(() => {
    if (!making) return;
    const name = `kdl_${making}`;
    const started = Date.now();
    const t = setInterval(() => {
      const v = readCookie(name);
      if (!v && Date.now() - started < 180_000) return;
      if (v && Date.now() - started < 1200) return;
      clearInterval(t);
      dropCookie(name);
      setMaking(null);
      setTok(token());
      if (v === "err") toast.error("Couldn't make the PDF. Try again, or print from the page.");
      else if (v === "ok") {
        onDone?.();
        if (phone) setDone(true);
      }
    }, 300);
    return () => clearInterval(t);
  }, [making, phone, onDone]);
  const url = `${href}${href.includes("?") ? "&" : "?"}dl=${tok}`;
  // the same link stays on the page while it loads (a link taken off the page as it's tapped
  // may not download on some phones); tapping it again meanwhile does nothing
  const link = (
    <Button size={size} variant="outline" asChild>
      <a
        href={url}
        download
        aria-disabled={making ? true : undefined}
        className={making ? "pointer-events-none opacity-80" : undefined}
        onClick={(e) => {
          if (making) return void e.preventDefault();
          setDone(false);
          setMaking(tok);
        }}
      >
        {making ? (
          <>
            <Loader2 className="animate-spin" /> Making the PDF…
          </>
        ) : (
          <>
            <FileDown /> {label}
          </>
        )}
      </a>
    </Button>
  );
  if (!phone || !done) return link;
  return (
    <span className="flex flex-col gap-1.5">
      <AfterDownload phone={phone} />
      <span className="self-start">{link}</span>
    </span>
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
