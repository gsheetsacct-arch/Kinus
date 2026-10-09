"use client";
import * as React from "react";

/** Reads Code 128 / QR from the phone camera and reports each new code. */
export function Camera({ onCode, onError }: { onCode: (text: string) => void; onError: (msg: string) => void }) {
  const video = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]]]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        if (cancelled || !video.current) return;
        const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current, (result) => {
          if (result) onCode(result.getText());
        });
        stop = () => controls.stop();
      } catch (e) {
        onError(e instanceof Error && /Permission|NotAllowed/i.test(e.name + e.message) ? "Camera permission was denied. Allow it in the browser settings, or type the name instead." : "The camera couldn't start on this device.");
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onCode, onError]);
  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-white/70" />
    </div>
  );
}
