import "server-only";

export type EmailResult = { sent: true; id: string } | { sent: false; reason: string };

const RESEND_TEST_SENDER = "onboarding@resend.dev";

/** Who emails come from, and whether that can reach anyone (Resend's test sender only reaches the account owner). */
export function emailSetup(): { configured: boolean; from: string; testSender: boolean } {
  const from = process.env.EMAIL_FROM || `Kinus <${RESEND_TEST_SENDER}>`;
  return { configured: Boolean(process.env.RESEND_API_KEY), from, testSender: from.includes(RESEND_TEST_SENDER) || /@example\.(com|org)\b/i.test(from) };
}

/** Resend's answer, in words the office can act on. */
export function explainEmailError(status: number, message: string): string {
  const m = message || `Resend answered ${status}`;
  if (/only send testing emails to your own email/i.test(m))
    return "Email is still in Resend's test mode, so it only reaches the Resend account's own address. Verify your camp's domain at resend.com/domains, then set EMAIL_FROM in Vercel to an address on it (e.g. Kinus <tags@yourcamp.org>) and redeploy.";
  if (/domain.*not verified|not verified.*domain|verify.*domain/i.test(m))
    return `The sender's domain isn't verified in Resend yet (EMAIL_FROM is ${emailSetup().from}). Finish verifying it at resend.com/domains, or change EMAIL_FROM in Vercel.`;
  if (status === 401 || status === 403 || /api key/i.test(m)) return "Resend didn't accept the API key. Check RESEND_API_KEY in Vercel (Settings → Environment Variables) and redeploy.";
  if (status === 429 || /rate limit|too many/i.test(m)) return "Too many emails at once (Resend's limit). Try again in a minute.";
  if (/attachment|too large|size/i.test(m)) return `The PDF was too big to email (${m}). Print it from the queue instead.`;
  if (/invalid.*(to|recipient)|to.*invalid/i.test(m)) return `An address it was sent to isn't valid (${m}). Check the office email in Settings.`;
  return m;
}

/** Sends through Resend's HTTP API. Without RESEND_API_KEY nothing is sent (and that's fine). */
export async function sendEmail(opts: { to: string[]; cc?: string[]; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "Email isn't set up yet (no RESEND_API_KEY in Vercel), so requests wait in the print queue." };
  // RESEND_API_URL: only for testing against a stand-in
  const base = (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: emailSetup().from,
        to: opts.to,
        cc: opts.cc?.length ? opts.cc : undefined,
        subject: opts.subject,
        html: opts.html,
        attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
    });
  } catch (e) {
    return { sent: false, reason: `Couldn't reach Resend (${e instanceof Error ? e.message : String(e)}). Try again in a minute.` };
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
  if (!res.ok || !body.id) return { sent: false, reason: explainEmailError(res.status, body.message ?? body.error ?? "") };
  return { sent: true, id: body.id };
}
