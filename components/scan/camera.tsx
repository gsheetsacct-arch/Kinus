"use client";
import * as React from "react";
import { RefreshCw, SwitchCamera, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
const DEVICE_KEY = "kinus:camera-device";
const ZOOM_KEY = "kinus:camera-zoom";
// tags are held a little way off: start zoomed in a bit (the button steps through these)
const ZOOMS = [1, 1.5, 2];
const START_ZOOM = 1.5;
type ZoomRange = { min: number; max: number };

function explain(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) return "The camera only works on the secure (https://) address of Kinus.";
  if (/NotAllowed|Permission|Security/i.test(name)) return "Camera permission is blocked. Allow the camera for this site (the icon left of the address bar), then try again.";
  if (/NotFound|DevicesNotFound|Overconstrained/i.test(name)) return "No camera was found on this device.";
  if (/NotReadable|TrackStart|Abort/i.test(name)) return "The camera is busy: another app or browser tab is using it (Zoom, Teams, another Kinus tab…). Close that, then try again.";
  return "The camera couldn't start on this device.";
}

/**
 * Reads QR codes (and the Code 128 barcodes on older labels) from the camera, zoomed in a
 * little to start with: the phone's own zoom where the browser offers it, otherwise the picture
 * is enlarged so the tag is easy to aim. One stream for as long as it's shown (it
 * doesn't restart when the page updates), the device's own barcode reader where there
 * is one (Android, Mac, Chromebook) and ZXing elsewhere (Windows, iPhone), upright or
 * sideways. A tag held
 * in view counts once until it has been out of view for a moment.
 */
/** overlay: the last scan's result, shown over the picture (where the person scanning is looking). */
/** fill: the whole of its (positioned) parent, the controls down the right side (the check-in page). */
export function Camera({ onCode, onTurnOff, overlay, fill = false }: { onCode: (text: string) => void; onTurnOff?: () => void; overlay?: React.ReactNode; fill?: boolean }) {
  const video = React.useRef<HTMLVideoElement>(null);
  const onCodeRef = React.useRef(onCode);
  onCodeRef.current = onCode;
  const [deviceId, setDeviceId] = React.useState<string | null | undefined>(undefined);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [state, setState] = React.useState<{ kind: "starting" } | { kind: "on" } | { kind: "error"; message: string }>({ kind: "starting" });
  const [attempt, setAttempt] = React.useState(0);
  const trackRef = React.useRef<MediaStreamTrack | null>(null);
  // the camera's own zoom range, or null where the browser has none (iPhone): then the picture is enlarged
  const [hwZoom, setHwZoom] = React.useState<ZoomRange | null>(null);
  const [zoom, setZoom] = React.useState(START_ZOOM);

  React.useEffect(() => {
    try {
      setDeviceId(localStorage.getItem(DEVICE_KEY));
      const z = Number(localStorage.getItem(ZOOM_KEY));
      if (ZOOMS.includes(z)) setZoom(z);
    } catch {
      setDeviceId(null);
    }
  }, []);

  React.useEffect(() => {
    if (deviceId === undefined) return;
    let cancelled = false;
    const el = video.current;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const seen = { text: "", at: 0 };
    const report = (text: string) => {
      const now = Date.now();
      const same = text === seen.text && now - seen.at < 2500;
      seen.text = text;
      seen.at = now;
      if (!same) onCodeRef.current(text);
    };
    setState({ kind: "starting" });
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
        const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: "environment" }, ...size } });
        } catch (e) {
          // the remembered camera was unplugged: fall back to any camera
          if (!deviceId || !/NotFound|Overconstrained/i.test((e as Error).name)) throw e;
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, ...size } });
        }
        if (cancelled) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const caps = (track.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
        setHwZoom(caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null);
        // keep refocusing on phones that allow it (tags are held close)
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
        if (cancelled) return;
        setState({ kind: "on" });
        navigator.mediaDevices
          .enumerateDevices()
          .then((d) => !cancelled && setDevices(d.filter((x) => x.kind === "videoinput")))
          .catch(() => undefined);

        const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        const formats = Native ? await Native.getSupportedFormats?.().catch(() => [] as string[]) : [];
        if (Native && formats?.includes("qr_code")) {
          const detector = new Native({ formats: ["code_128", "qr_code"].filter((f) => formats.includes(f)) });
          const loop = async () => {
            if (cancelled) return;
            if (v.readyState >= 2) {
              const codes = await detector.detect(v).catch(() => []);
              if (codes[0]?.rawValue) report(codes[0].rawValue);
            }
            timer = setTimeout(loop, 120);
          };
          loop();
          return;
        }
        // ZXing on frames we grab ourselves (iPhones: Safari has no BarcodeDetector). Tags carry a
        // QR code: most frames look for just that, in the middle of the picture where the tag is
        // held, scaled down (QR codes read at any angle, so no turning). Every few frames the whole
        // picture is also tried for a barcode (the 4×6 labels' runs up the side: turned a quarter
        // every other time), for any older label that still has one.
        const { HTMLCanvasElementLuminanceSource } = await import("@zxing/browser");
        const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader } = await import("@zxing/library");
        const readerFor = (formats: unknown[]) => {
          const r = new MultiFormatReader();
          r.setHints(
            new Map<number, unknown>([
              [DecodeHintType.POSSIBLE_FORMATS, formats],
              [DecodeHintType.TRY_HARDER, true],
            ]) as never,
          );
          return r;
        };
        const qrReader = readerFor([BarcodeFormat.QR_CODE]);
        const barReader = readerFor([BarcodeFormat.CODE_128]);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const decode = (reader: InstanceType<typeof MultiFormatReader>) => {
          try {
            report(reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)))).getText());
            return true;
          } catch {
            return false; // nothing readable in this frame
          }
        };
        const QR_SIDE = 640; // the middle of the picture, scaled to at most this many pixels
        let tick = 0;
        let turn = false;
        const loop = () => {
          if (cancelled || !ctx) return;
          const w = v.videoWidth;
          const h = v.videoHeight;
          if (v.readyState >= 2 && w && h) {
            tick++;
            if (tick % 6 !== 0) {
              // QR: the middle 80% square
              const side = Math.round(Math.min(w, h) * 0.8);
              const out = Math.min(side, QR_SIDE);
              canvas.width = out;
              canvas.height = out;
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.drawImage(v, Math.round((w - side) / 2), Math.round((h - side) / 2), side, side, 0, 0, out, out);
              decode(qrReader);
            } else {
              // now and then: a barcode, anywhere in the picture (a QR code too, from the edges)
              if (turn) {
                canvas.width = h;
                canvas.height = w;
                ctx.setTransform(0, 1, -1, 0, h, 0);
              } else {
                canvas.width = w;
                canvas.height = h;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
              }
              ctx.drawImage(v, 0, 0, w, h);
              if (!decode(barReader)) decode(qrReader);
              turn = !turn;
            }
          }
          timer = setTimeout(loop, 80);
        };
        loop();
      } catch (e) {
        if (!cancelled) setState({ kind: "error", message: explain(e) });
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      trackRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      if (el) el.srcObject = null;
    };
  }, [deviceId, attempt]);

  // the camera's own zoom when it has one (sharper: the reader sees the closer picture too)
  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || !hwZoom) return;
    const z = Math.min(hwZoom.max, Math.max(hwZoom.min, zoom));
    track.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }).catch(() => undefined);
  }, [zoom, hwZoom, state.kind]);
  const nextZoom = () => {
    const z = ZOOMS[(ZOOMS.indexOf(zoom) + 1) % ZOOMS.length];
    setZoom(z);
    try {
      localStorage.setItem(ZOOM_KEY, String(z));
    } catch {}
  };

  const current = (video.current?.srcObject as MediaStream | null)?.getVideoTracks()[0]?.getSettings().deviceId;
  const next = () => {
    if (devices.length < 2) return;
    const i = devices.findIndex((d) => d.deviceId === (deviceId ?? current));
    const d = devices[(i + 1) % devices.length];
    setDeviceId(d.deviceId);
    try {
      localStorage.setItem(DEVICE_KEY, d.deviceId);
    } catch {}
  };

  const controls = fill ? "absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2" : null;
  return (
    <>
      {/* no camera (an office laptop): a short note instead of a big black box */}
      {state.kind === "error" && (
        <div className={fill ? "absolute inset-0 flex items-center justify-center p-6" : undefined}>
          <div className={fill ? "max-w-sm space-y-3 rounded-2xl bg-card p-4 text-sm shadow-lg" : "flex flex-wrap items-center gap-2 rounded-xl border border-dashed bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"}>
            <p className="min-w-0 flex-1 basis-56">{state.message}</p>
            <span className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
                <RefreshCw /> Try again
              </Button>
              {onTurnOff && (
                <Button size="sm" variant="ghost" onClick={onTurnOff}>
                  Don&apos;t use the camera here
                </Button>
              )}
            </span>
          </div>
        </div>
      )}
      <div className={state.kind === "error" ? "hidden" : fill ? "absolute inset-0 overflow-hidden bg-black" : "relative overflow-hidden rounded-xl bg-black"}>
        <video
          ref={video}
          className={fill ? "h-full w-full object-cover" : "aspect-[4/3] max-h-[50dvh] w-full object-cover"}
          style={!hwZoom && zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}
          muted
          playsInline
          autoPlay
        />
        {/* where to hold the QR code: a square, marked at its corners */}
        {state.kind === "on" && (
          <div className={fill ? "pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(64vw,38dvh)] -translate-x-1/2 -translate-y-1/2" : "pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[62%] -translate-x-1/2 -translate-y-1/2"}>
            <span className="absolute left-0 top-0 size-8 rounded-tl-xl border-l-4 border-t-4 border-white/90" />
            <span className="absolute right-0 top-0 size-8 rounded-tr-xl border-r-4 border-t-4 border-white/90" />
            <span className="absolute bottom-0 left-0 size-8 rounded-bl-xl border-b-4 border-l-4 border-white/90" />
            <span className="absolute bottom-0 right-0 size-8 rounded-br-xl border-b-4 border-r-4 border-white/90" />
          </div>
        )}
        {state.kind === "starting" && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting the camera…</div>}
        {overlay && <div className="absolute inset-x-2 top-2 z-10">{overlay}</div>}
        {state.kind === "on" && (
          <div className={controls ?? "contents"}>
            <Button size="sm" variant="secondary" className={controls ? "opacity-90" : "absolute bottom-2 right-2 opacity-90"} onClick={nextZoom} aria-label={`Zoom ${zoom}×: tap to change`}>
              <ZoomIn /> {zoom}×
            </Button>
            {devices.length > 1 && (
              <Button size="sm" variant="secondary" className={controls ? "opacity-90" : "absolute right-2 top-2 opacity-90"} onClick={next} aria-label="Use another camera">
                <SwitchCamera /> {controls ? null : "Switch camera"}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
