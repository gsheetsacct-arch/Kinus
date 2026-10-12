// Builds the Supabase Auth email templates in docs/email-templates/ from one layout.
//   node scripts/email-templates.mjs
// Then paste each file into Supabase → Authentication → Emails → Templates (see README there).
// Supabase fills in {{ .ConfirmationURL }}, {{ .Email }}, {{ .NewEmail }}, {{ .Token }}, {{ .Data.* }}.
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "docs", "email-templates");
const C = { primary: "#00618f", soft: "#daf1fe", bg: "#f7f9fc", text: "#141b24", muted: "#616a75", border: "#dbe0e6" };
const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const button = (label, href = "{{ .ConfirmationURL }}") => `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
              <tr>
                <td bgcolor="${C.primary}" style="border-radius:10px">
                  <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${label}</a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-size:13px;line-height:20px;color:${C.muted}">Button not working? Copy this link into your browser:<br><a href="${href}" style="color:${C.primary};word-break:break-all">${href}</a></p>`;

const code = () => `
            <p style="margin:28px 0 8px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:${C.text};background:${C.soft};border-radius:10px;padding:16px 20px;text-align:center">{{ .Token }}</p>`;

function page({ preheader, title, body, action, footnote }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
          <tr>
            <td style="padding:0 4px 18px;font-family:${font}">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td bgcolor="${C.primary}" width="36" height="36" align="center" style="border-radius:10px;font-family:${font};font-size:18px;font-weight:700;color:#ffffff">K</td>
                <td style="padding-left:10px;font-family:${font};font-size:20px;font-weight:700;color:${C.text}">Kinus</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${C.border};border-radius:16px;padding:32px 28px;font-family:${font};color:${C.text}">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:30px;font-weight:700;color:${C.text}">${title}</h1>
              ${body}${action}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 8px 0;font-family:${font};font-size:12px;line-height:18px;color:${C.muted}">
              ${footnote}<br>Kinus · camp check-in · staff only
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

const p = (t) => `<p style="margin:0 0 12px;font-size:16px;line-height:24px;color:${C.text}">${t}</p>`;
const hi = `{{ if .Data.full_name }}Hi {{ .Data.full_name }},{{ else }}Hi,{{ end }}`;
const notYou = "Didn't ask for this? You can ignore this email: nothing happens without the link.";

const templates = [
  {
    file: "invite.html",
    supabase: "Invite user",
    subject: "You're invited to Kinus",
    preheader: "Tap the button to sign in and choose a password.",
    title: "You're invited to Kinus",
    body: p(hi) + p("You've been added to Kinus, the camp's check-in system. Tap below to sign in, then choose a password (or keep signing in with emailed links)."),
    action: button("Accept invitation"),
    footnote: "The link works once. If it has expired, ask whoever added you to send a new invitation, or use “Email me a sign-in link” on the sign-in page.",
  },
  {
    file: "magic-link.html",
    supabase: "Magic link",
    subject: "Your Kinus sign-in link",
    preheader: "Tap to sign in. Works once, on any device.",
    title: "Sign in to Kinus",
    body: p("Tap the button to sign in as <strong>{{ .Email }}</strong>. It works on any phone or computer, once, for the next hour."),
    action: button("Sign in to Kinus"),
    footnote: notYou,
  },
  {
    file: "reset-password.html",
    supabase: "Reset password",
    subject: "Reset your Kinus password",
    preheader: "Tap to choose a new password.",
    title: "Choose a new password",
    body: p("Someone (hopefully you) asked to reset the password for <strong>{{ .Email }}</strong>. Tap below to choose a new one. Your old password stops working once you do."),
    action: button("Choose a new password"),
    footnote: "The link works once, for the next hour. " + notYou,
  },
  {
    file: "confirm-signup.html",
    supabase: "Confirm signup",
    subject: "Confirm your email for Kinus",
    preheader: "Tap to confirm your email address.",
    title: "Confirm your email",
    body: p(hi) + p("Tap below to confirm <strong>{{ .Email }}</strong> for your Kinus account."),
    action: button("Confirm email"),
    footnote: notYou,
  },
  {
    file: "change-email.html",
    supabase: "Change email address",
    subject: "Confirm your new email for Kinus",
    preheader: "Tap to confirm the change.",
    title: "Confirm your new email",
    body: p("Your Kinus account is changing from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>. Tap below to confirm."),
    action: button("Confirm new email"),
    footnote: "Didn't ask for this? Don't tap the button, and tell a camp director.",
  },
  {
    file: "reauthentication.html",
    supabase: "Reauthentication",
    subject: "Your Kinus confirmation code",
    preheader: "Enter this code in Kinus to continue.",
    title: "Your confirmation code",
    body: p("Enter this code in Kinus to confirm it's you:"),
    action: code(),
    footnote: "The code expires soon. Didn't ask for this? You can ignore this email: nothing happens without the code.",
  },
];

fs.mkdirSync(OUT, { recursive: true });
for (const t of templates) fs.writeFileSync(path.join(OUT, t.file), page(t));
const rows = templates.map((t) => `| ${t.supabase} | \`${t.subject}\` | [${t.file}](${t.file}) |`).join("\n");
fs.writeFileSync(
  path.join(OUT, "README.md"),
  `# Email templates (Supabase Auth)

The emails Supabase sends for sign-in, styled like Kinus. To install them:

1. Supabase → **Authentication → Emails → Templates**.
2. For each row below: pick the template, paste the **subject**, then open the file, copy everything
   (on GitHub: the file → **Raw** → select all) and paste it into the **message body** (Source / HTML).
3. Save. Send yourself a test (e.g. "Forgot your password?" on the sign-in page) to see it.

| Supabase template | Subject | Body |
|---|---|---|
${rows}

Notes
- Keep \`{{ .ConfirmationURL }}\` in the button: that link signs the person in and brings them back to Kinus
  (invitations and password resets then open "Set a password").
- "Confirm signup" is only used if sign-ups are on; Kinus adds people from the Staff page, so it's a spare.
- The emails say links work "for the next hour": Supabase's default (Authentication → Emails → Email OTP Expiration).
- To change the look or wording, edit \`scripts/email-templates.mjs\` and run \`node scripts/email-templates.mjs\`.
`,
);
console.log(`${templates.length} templates written to ${OUT}`);
