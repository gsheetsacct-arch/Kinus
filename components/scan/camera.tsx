"use client";
import * as React from "react";
import { RefreshCw, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
const DEVICE_KEY = "kinus:camera-device";

function explain(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) return "The camera only works on the secure (https://) address of Kinus.";
  if (/NotAllowed|Permission|Security/i.test(name)) return "Camera permission is blocked. Allow the camera for this site (the icon left of the address bar), then try again.";
  if (/NotFound|DevicesNotFound|Overconstrained/i.test(name)) return "No camera was found on this device.";
  if (/NotReadable|TrackStart|Abort/i.test(name)) return "The camera is busy: another app or browser tab is using it (Zoom, Teams, another Kinus tab…). Close that, then try again.";
  return "The camera couldn't start on this device.";
}

/**
 * Reads Code 128 / QR codes from the camera. One stream for as long as it's shown (it
 * doesn't restart when the page updates), the device's own barcode reader where there
 * is one (Android, Mac, Chromebook) and ZXing elsewhere (Windows, iPhone), upright or
 * sideways. A tag held
 * in view counts once until it has been out of view for a moment.
 */
export function Camera({ onCode }: { onCode: (text: string) => void }) {
  const video = React.useRef<HTMLVideoElement>(null);
  const onCodeRef = React.useRef(onCode);
  onCodeRef.current = onCode;
  const [deviceId, setDeviceId] = React.useState<string | null | undefined>(undefined);
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [state, setState] = React.useState<{ kind: "starting" } | { kind: "on" } | { kind: "error"; message: string }>({ kind: "starting" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    try {
      setDeviceId(localStorage.getItem(DEVICE_KEY));
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
        if (Native && formats?.includes("code_128")) {
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
        // ZXing on frames we grab ourselves, every other frame turned a quarter: the 4×6
        // labels have their barcode running up the side
        const { HTMLCanvasElementLuminanceSource } = await import("@zxing/browser");
        const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader } = await import("@zxing/library");
        const reader = new MultiFormatReader();
        reader.setHints(
          new Map<number, unknown>([
            [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]],
            [DecodeHintType.TRY_HARDER, true],
          ]) as never,
        );
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let turn = false;
        const loop = () => {
          if (cancelled || !ctx) return;
          const w = v.videoWidth;
          const h = v.videoHeight;
          if (v.readyState >= 2 && w && h) {
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
            try {
              report(reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)))).getText());
            } catch {
              // nothing readable in this frame
            }
            turn = !turn;
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
      stream?.getTracks().forEach((t) => t.stop());
      if (el) el.srcObject = null;
    };
  }, [deviceId, attempt]);

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

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={video} className="aspect-[4/3] max-h-[50dvh] w-full object-cover" muted playsInline autoPlay />
      {state.kind === "on" && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-white/70" />}
      {state.kind === "starting" && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting the camera…</div>}
      {state.kind === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white">
          <p>{state.message}</p>
          <Button size="sm" variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
            <RefreshCw /> Try again
          </Button>
        </div>
      )}
      {state.kind === "on" && devices.length > 1 && (
        <Button size="sm" variant="secondary" className="absolute right-2 top-2 opacity-90" onClick={next} aria-label="Use another camera">
          <SwitchCamera /> Switch camera
        </Button>
      )}
    </div>
  );
}
