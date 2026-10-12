"use client";
import * as React from "react";
import { toast } from "sonner";
import { Copy, KeyRound, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createCheckinLogin, resetCheckinPassword, type CheckinResult } from "@/app/(app)/admin/users/actions";
import { formatDateTime } from "@/lib/utils";

export type CheckinLoginRow = { divisionId: string; divisionName: string; color: string | null; account: { id: string; name: string; active: boolean; lastSignIn: string | null } | null };

/**
 * One check-in login per division: the check-in phones of that division sign in with its
 * name and password. Head staff and directors check in with their own accounts.
 */
export function CheckinLogins({ logins }: { logins: CheckinLoginRow[] }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState<{ division: string; username: string; password: string } | null>(null);
  const run = async (key: string, division: string, call: () => Promise<CheckinResult>) => {
    setBusy(key);
    try {
      const r = await call();
      if (!r.ok) return void toast.error(r.error);
      if (r.username && r.password) setShown({ division, username: r.username, password: r.password });
    } finally {
      setBusy(null);
    }
  };
  if (!logins.length) return null;
  return (
    <section className="rounded-xl border bg-card shadow-[var(--shadow-card)]">
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ScanLine className="size-4 text-muted-foreground" /> Check-in logins
        </h2>
        <p className="text-sm text-muted-foreground">
          One per division, for the phones at its check-in line: they sign in with the division&apos;s name and a password. Head staff and directors check in with their own accounts.
        </p>
      </div>
      <ul className="divide-y">
        {logins.map((l) => (
          <li key={l.divisionId} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: l.color ?? "var(--muted-foreground)" }} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium" dir="auto">
                {l.divisionName}
              </span>
              <span className="block text-xs text-muted-foreground">
                {l.account ? (
                  <>
                    Sign-in name <code className="rounded bg-muted px-1 py-0.5 text-foreground">{l.account.name}</code>
                    {!l.account.active && " · deactivated"}
                    {l.account.lastSignIn ? ` · last used ${formatDateTime(l.account.lastSignIn)}` : " · not used yet"}
                  </>
                ) : (
                  "No check-in login yet"
                )}
              </span>
            </span>
            {l.account ? (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(l.divisionId, l.divisionName, () => resetCheckinPassword(l.account!.id))}>
                <KeyRound /> {busy === l.divisionId ? "Setting…" : "New password"}
              </Button>
            ) : (
              <Button size="sm" disabled={busy !== null} onClick={() => run(l.divisionId, l.divisionName, () => createCheckinLogin(l.divisionId))}>
                {busy === l.divisionId ? "Creating…" : "Create login"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(shown)} onOpenChange={(o) => !o && setShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check-in login for {shown?.division}</DialogTitle>
            <DialogDescription>On each check-in phone, open Kinus and sign in with these. Write the password down now: it isn&apos;t shown again.</DialogDescription>
          </DialogHeader>
          {shown && (
            <div className="space-y-3">
              {[
                ["Email or check-in name", shown.username],
                ["Password", shown.password],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                  <span>
                    <span className="block text-xs text-muted-foreground">{label}</span>
                    <code className="text-lg font-semibold">{value}</code>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard?.writeText(value).then(() => toast.success("Copied"), () => undefined);
                    }}
                    aria-label={`Copy ${label}`}
                  >
                    <Copy />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Tip: after signing in, add Kinus to the phone&apos;s home screen so it opens like an app.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
