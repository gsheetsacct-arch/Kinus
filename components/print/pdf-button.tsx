"use client";
import * as React from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export const phoneOf = () => {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/android/i.test(ua)) return "android" as const;
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document)) return "ios" as const;
  return null;
};

/**
 * Download a PDF: a plain link the browser downloads itself, on the tap (a download started
 * later, after fetching the file in the page, is quietly blocked by phone browsers). On a phone
 * it then says how to print it on the label printer (NIIMBOT).
 */
export function PdfButton({ href, label, size = "lg", onDone }: { href: string; label: string; size?: "lg" | "default" | "sm"; onDone?: () => void }) {
  const [phone, setPhone] = React.useState<"android" | "ios" | null>(null);
  const [done, setDone] = React.useState(false);
  React.useEffect(() => setPhone(phoneOf()), []);
  React.useEffect(() => setDone(false), [href]);
  const link = (
    <Button size={size} variant="outline" asChild>
      <a
        href={href}
        download
        onClick={() => {
          onDone?.();
          if (phone) setDone(true);
        }}
      >
        <FileDown /> {label}
      </a>
    </Button>
  );
  if (!phone || !done) return link;
  return (
    <span className="flex flex-col gap-1.5">
      <AfterDownload phone={phone} />
      <span className="text-xs text-muted-foreground">
        The PDF is made first, so it can take a moment to start.{" "}
        <a href={href} download className="underline">
          Download again
        </a>
      </span>
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
