import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type TwilioConfig = { accountSid: string; authToken: string; messagingServiceSid: string | null; from: string | null };

// set in Vercel: the account, and a Messaging Service (preferred) or one number to send from
const env = () => ({
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
});

/** Twilio's settings from the environment (Vercel), or null until they're all there. */
export function twilioConfig(): TwilioConfig | null {
  const e = env();
  const accountSid = e.TWILIO_ACCOUNT_SID?.trim();
  const authToken = e.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = e.TWILIO_MESSAGING_SERVICE_SID?.trim() || null;
  const from = e.TWILIO_FROM_NUMBER?.trim() || null;
  if (!accountSid || !authToken || (!messagingServiceSid && !from)) return null;
  return { accountSid, authToken, messagingServiceSid, from };
}

/** What's missing, in words for the setup note on Text staff. */
export function twilioMissing(): string[] {
  const e = env();
  const missing: string[] = [];
  if (!e.TWILIO_ACCOUNT_SID?.trim()) missing.push("TWILIO_ACCOUNT_SID");
  if (!e.TWILIO_AUTH_TOKEN?.trim()) missing.push("TWILIO_AUTH_TOKEN");
  if (!e.TWILIO_MESSAGING_SERVICE_SID?.trim() && !e.TWILIO_FROM_NUMBER?.trim()) missing.push("TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM_NUMBER)");
  return missing;
}

export class TwilioError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Sends one text. Twilio queues it and reports how it went to statusCallback. */
export async function sendSms(config: TwilioConfig, msg: { to: string; body: string; statusCallback?: string }): Promise<{ sid: string; status: string }> {
  const form = new URLSearchParams({ To: msg.to, Body: msg.body });
  if (config.messagingServiceSid) form.set("MessagingServiceSid", config.messagingServiceSid);
  else form.set("From", config.from!);
  if (msg.statusCallback) form.set("StatusCallback", msg.statusCallback);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
  if (!res.ok || !data.sid) throw new TwilioError(data.message ?? `Twilio answered ${res.status}`, data.code != null ? String(data.code) : null, res.status);
  return { sid: data.sid, status: data.status ?? "queued" };
}

/**
 * Whether a request really came from Twilio: X-Twilio-Signature is an HMAC-SHA1, keyed with the
 * auth token, of the full address Twilio called followed by each form field (sorted) name+value.
 */
export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A webhook from Twilio: its form fields, if the signature checks out against one of the addresses it may have used. */
export async function readTwilioWebhook(request: Request, config: TwilioConfig): Promise<Record<string, string> | null> {
  const form = await request.formData().catch(() => null);
  if (!form) return null;
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });
  const url = new URL(request.url);
  // behind Vercel the address Twilio called is the public one: APP_URL, or the forwarded host
  const candidates = new Set([request.url]);
  if (process.env.APP_URL) candidates.add(process.env.APP_URL.replace(/\/+$/, "") + url.pathname + url.search);
  const host = request.headers.get("x-forwarded-host");
  if (host) candidates.add(`https://${host}${url.pathname}${url.search}`);
  const signature = request.headers.get("x-twilio-signature");
  return [...candidates].some((u) => validTwilioSignature(config.authToken, u, params, signature)) ? params : null;
}
