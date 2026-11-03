import type { CurrentUser } from "@/lib/auth/permissions";

/**
 * Who may connect their AI to Kinus (the Kinus connector): anyone with their own sign-in. The
 * phones at a check-in line (shared logins) don't. What the AI may do is still only what this
 * person may do; the template tools only for those who may edit templates.
 */
export const canConnect = (user: CurrentUser) => !user.checkinLogin;
