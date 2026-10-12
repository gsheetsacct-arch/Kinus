# Email templates (Supabase Auth)

The emails Supabase sends for sign-in, styled like Kinus. To install them:

1. Supabase → **Authentication → Emails → Templates**.
2. For each row below: pick the template, paste the **subject**, then open the file, copy everything
   (on GitHub: the file → **Raw** → select all) and paste it into the **message body** (Source / HTML).
3. Save. Send yourself a test (e.g. "Forgot your password?" on the sign-in page) to see it.

| Supabase template | Subject | Body |
|---|---|---|
| Invite user | `You're invited to Kinus` | [invite.html](invite.html) |
| Magic link | `Your Kinus sign-in link` | [magic-link.html](magic-link.html) |
| Reset password | `Reset your Kinus password` | [reset-password.html](reset-password.html) |
| Confirm signup | `Confirm your email for Kinus` | [confirm-signup.html](confirm-signup.html) |
| Change email address | `Confirm your new email for Kinus` | [change-email.html](change-email.html) |
| Reauthentication | `Your Kinus confirmation code` | [reauthentication.html](reauthentication.html) |

Notes
- Keep `{{ .ConfirmationURL }}` in the button: that link signs the person in and brings them back to Kinus
  (invitations and password resets then open "Set a password").
- "Confirm signup" is only used if sign-ups are on; Kinus adds people from the Staff page, so it's a spare.
- The emails say links work "for the next hour": Supabase's default (Authentication → Emails → Email OTP Expiration).
- To change the look or wording, edit `scripts/email-templates.mjs` and run `node scripts/email-templates.mjs`.
