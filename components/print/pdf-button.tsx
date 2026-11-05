"use client";
import * as React from "react";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { jobsPrinted } from "@/app/(app)/print/actions";

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
 * PDF is being made it says so. With mark (request ids), the server marks them printed as it
 * sends the PDF, and the button waits for that (asking the server): a phone that downloads in
 * a view of its own (Kinus opened from the home screen) never passes the page the server's
 * other word, a short cookie (see the combined PDF route), which is still read when it comes.
 * On a phone it then says how to print it on the label printer (NIIMBOT).
 */
export function PdfButton({ href, label, size = "lg", onDone, mark }: { href: string; label: string; size?: "lg" | "default" | "sm"; onDone?: () => void; /** requests the server marks printed as it sends the PDF */ mark?: string[] }) {
  const [phone, setPhone] = React.useState<"android" | "ios" | null>(null);
  const [done, setDone] = React.useState(false);
  const [making, setMaking] = React.useState<string | null>(null);
  const [tok, setTok] = React.useState(token);
  React.useEffect(() => setPhone(phoneOf()), []);
  // the latest onDone and ids, without restarting the wait each time the page draws again
  const doneRef = React.useRef(onDone);
  const markRef = React.useRef(mark);
  React.useEffect(() => {
    doneRef.current = onDone;
    markRef.current = mark;
  });
  React.useEffect(() => setDone(false), [href]);
  // waiting for the download: the server's cookie, or (marking) the requests marked printed, or
  // (neither can be heard) the page coming back after the download took it away; 3 minutes at most
  React.useEffect(() => {
    if (!making) return;
    const name = `kdl_${making}`;
    const started = Date.now();
    let left = false; // the page was hidden or lost focus (a download sheet, a separate view)
    let finished = false;
    const finish = (outcome: "ok" | "err" | "unknown") => {
      if (finished) return;
      finished = true;
      dropCookie(name);
      setMaking(null);
      setTok(token());
      if (outcome === "err") toast.error("Couldn't make the PDF. Try again, or print from the page.");
      else if (outcome === "ok") {
        // the caller says what happens next (the queue's note); otherwise the phone steps here
        if (doneRef.current) doneRef.current();
        else if (phone) setDone(true);
      } else if (phone && !doneRef.current) setDone(true);
    };
    const away = () => (left = true);
    const back = () => {
      // came back from the download: without a way to hear it (no marking), it's done
      if (left && !markRef.current?.length) setTimeout(() => finish("unknown"), 1500);
    };
    const onVis = () => (document.visibilityState === "hidden" ? away() : back());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    let asking = false;
    const t = setInterval(() => {
      const v = readCookie(name);
      if (v && Date.now() - started >= 1200) return finish(v === "err" ? "err" : "ok");
      if (Date.now() - started > 180_000) return finish("unknown");
      // marking: ask the server whether they're printed now (every second or so)
      const ids = markRef.current;
      if (ids?.length && !asking && Date.now() - started >= 1200) {
        asking = true;
        jobsPrinted(ids)
          .then((yes) => yes && finish("ok"))
          .catch(() => undefined)
          .finally(() => (asking = false));
      }
    }, 1000);
    return () => {
      clearInterval(t);
      // taken off the page while waiting (the queue read again, its requests now printed): the
      // note still comes, once the server says they're printed
      const ids = markRef.current;
      if (!finished && ids?.length) {
        finished = true;
        jobsPrinted(ids)
          .then((yes) => yes && doneRef.current?.())
          .catch(() => undefined);
      }
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
    };
  }, [making, phone]);
  const url = `${href}${href.includes("?") ? "&" : "?"}dl=${tok}${mark?.length ? "&mark=1" : ""}`;
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
