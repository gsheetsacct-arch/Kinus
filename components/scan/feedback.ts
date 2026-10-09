"use client";
let ctx: AudioContext | null = null;

/** Short distinct sounds: success (one high beep), already (two soft), error (low buzz). */
export function feedback(kind: "ok" | "already" | "error") {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(kind === "ok" ? 60 : kind === "already" ? [40, 60, 40] : [200]);
    if (localStorage.getItem("kinus:sound") === "off") return;
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const tones = kind === "ok" ? [[880, 0, 0.12]] : kind === "already" ? [[520, 0, 0.08], [520, 0.14, 0.08]] : [[180, 0, 0.3]];
    for (const [f, start, dur] of tones) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = kind === "error" ? "square" : "sine";
      g.gain.setValueAtTime(0.15, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur + 0.02);
    }
  } catch {
    // sound is a nicety
  }
}
