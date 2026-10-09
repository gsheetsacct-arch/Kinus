import "server-only";

export type EmailResult = { sent: true; id: string } | { sent: false; reason: string };

/** Sends through Resend's HTTP API. Without RESEND_API_KEY nothing is sent (and that's fine). */
export async function sendEmail(opts: { to: string[]; cc?: string[]; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "Email isn't set up yet (no RESEND_API_KEY)." };
  const from = process.env.EMAIL_FROM || "Kinus <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: opts.to,
      cc: opts.cc?.length ? opts.cc : undefined,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id) return { sent: false, reason: body.message ?? `Resend answered ${res.status}` };
  return { sent: true, id: body.id };
}
