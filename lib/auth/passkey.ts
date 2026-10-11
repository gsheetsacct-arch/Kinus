/** Passkeys (Face ID, Touch ID, fingerprint, Windows Hello) through Supabase Auth. Browser side. */

/** This browser can use passkeys at all. */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function" && Boolean(navigator.credentials);
}

/** A short name for the device being registered, shown in the list ("iPhone", "Mac"…). */
export function deviceName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  if (/CrOS/.test(ua)) return "Chromebook";
  return "This device";
}

/** Plain words for what went wrong (or null when the person simply closed the prompt). */
export function passkeyErrorMessage(error: unknown): string | null {
  const e = error as { code?: string; name?: string; message?: string; status?: number } | null;
  const code = e?.code ?? "";
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`;
  // closed the Face ID / fingerprint prompt, or it timed out
  if (code === "ERROR_CEREMONY_ABORTED" || /NotAllowedError|AbortError|cancel|timed out/i.test(text)) return null;
  if (/passkey.*(disabled|not enabled)|webauthn.*(disabled|not enabled)|feature.*disabled/i.test(text) || e?.status === 404) {
    return "Face ID sign-in isn't switched on for Kinus yet. Ask the owner to turn on Passkeys in Supabase.";
  }
  if (/InvalidStateError|already registered|excludeCredentials/i.test(text)) return "This device is already set up to sign you in.";
  if (/challenge_expired/i.test(code + text)) return "That took too long. Try again.";
  if (/SecurityError|rp ?id|origin/i.test(text)) return "Face ID sign-in doesn't work on this web address. Use the camp's usual Kinus address.";
  if (/credential.*not found|no passkey|unknown credential/i.test(text)) return "No Face ID sign-in is set up for this device yet. Sign in another way, then add it on your Account page.";
  return e?.message || "Face ID sign-in didn't work. Sign in another way.";
}
