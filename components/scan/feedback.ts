"use client";
let ctx: AudioContext | null = null;

const audio = () => {
  ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
};

/**
 * Phones only let a page make sound after a tap, and a camera scan isn't one: the first
 * tap anywhere on the check-in page wakes the sound up (a silent blip), so every scan after
 * it is heard. On iPhones the page's sound also plays with the ring switch on silent.
 */
export function unlockSound() {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
    const c = audio();
    if (c.state === "suspended") void c.resume();
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch {
    // sound is a nicety
  }
}

/**
 * Short distinct sounds, with a buzz: success (a bright rising chime), already (two soft
 * beeps), error (a low buzz).
 */
export function feedback(kind: "ok" | "already" | "error") {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(kind === "ok" ? 80 : kind === "already" ? [40, 60, 40] : [250]);
    if (localStorage.getItem("kinus:sound") === "off") return;
    const c = audio();
    if (c.state === "suspended") void c.resume();
    const tones: [number, number, number][] = kind === "ok" ? [[880, 0, 0.1], [1320, 0.09, 0.16]] : kind === "already" ? [[520, 0, 0.09], [520, 0.15, 0.09]] : [[180, 0, 0.35]];
    for (const [f, start, dur] of tones) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = f;
      o.type = kind === "error" ? "square" : "triangle";
      g.gain.setValueAtTime(0.0001, c.currentTime + start);
      g.gain.exponentialRampToValueAtTime(kind === "error" ? 0.25 : 0.5, c.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + start);
      o.stop(c.currentTime + start + dur + 0.03);
    }
  } catch {
    // sound is a nicety
  }
}
