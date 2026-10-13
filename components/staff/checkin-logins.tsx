"use client";
import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Plus, RefreshCw, ScanLine, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { checkinLoginProblem, checkinName, generatePassword } from "@/lib/staff/login-kinds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createCheckinLogin, deletePeople, resetCheckinPassword, type CheckinResult } from "@/app/(app)/admin/users/actions";
import { formatDateTime, plural } from "@/lib/utils";

export type CheckinAccount = { id: string; name: string; active: boolean; lastSignIn: string | null };
export type CheckinLoginRow = { divisionId: string; divisionName: string; color: string | null; accounts: CheckinAccount[] };

/**
 * Check-in logins: shared sign-ins for the phones at a division's check-in line. A division
 * can have as many as it needs (one per gate or per phone), each with its own name and
 * password. Head staff and directors check in with their own accounts.
 */
export function CheckinLogins({ logins }: { logins: CheckinLoginRow[] }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState<{ division: string; username: string; password: string } | null>(null);
  const [removing, setRemoving] = React.useState<CheckinAccount | null>(null);
  // choosing a name and password before creating a login, or a new password for one
  const [editing, setEditing] = React.useState<{ division: CheckinLoginRow; account?: CheckinAccount; name: string; password: string } | null>(null);
  const allNames = new Set(logins.flatMap((l) => l.accounts.map((a) => a.name)));
  const suggestName = (divisionName: string) => {
    const base = checkinName(divisionName);
    let name = base;
    for (let n = 2; allNames.has(name); n++) name = `${base}-${n}`;
    return name;
  };
  const save = () => {
    if (!editing) return;
    const { division, account, name, password } = editing;
    const problem = checkinLoginProblem(account ? account.name : name, password);
    if (problem) return void toast.error(problem);
    setEditing(null);
    if (account) run(account.id, division.divisionName, () => resetCheckinPassword(account.id, password));
    else run(`add:${division.divisionId}`, division.divisionName, () => createCheckinLogin(division.divisionId, { name, password }));
  };
  const router = useRouter();
  const run = async (key: string, division: string, call: () => Promise<CheckinResult>) => {
    setBusy(key);
    try {
      const r = await call();
      if (!r.ok) return void toast.error(r.error);
      if (r.username && r.password) setShown({ division, username: r.username, password: r.password });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };
  const remove = async (a: CheckinAccount) => {
    setRemoving(null);
    setBusy(a.id);
    try {
      const fd = new FormData();
      fd.append("ids", a.id);
      const r = await deletePeople(fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Removed ${a.name}. Phones signed in with it are signed out.`);
      router.refresh();
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
          For the phones at a division&apos;s check-in line: they sign in with a check-in name and password. Add as many as you need, one per gate or per phone. Head staff and directors
          check in with their own accounts.
        </p>
      </div>
      <ul className="divide-y">
        {logins.map((l) => (
          <li key={l.divisionId} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: l.color ?? "var(--muted-foreground)" }} />
              <span className="min-w-0 flex-1">
                <span className="font-medium" dir="auto">
                  {l.divisionName}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{l.accounts.length ? plural(l.accounts.length, "login") : "No check-in login yet"}</span>
              </span>
              <Button size="sm" variant={l.accounts.length ? "outline" : "default"} disabled={busy !== null} onClick={() => setEditing({ division: l, name: suggestName(l.divisionName), password: generatePassword() })}>
                <Plus /> {busy === `add:${l.divisionId}` ? "Creating…" : l.accounts.length ? "Add another" : "Create login"}
              </Button>
            </div>
            {l.accounts.length > 0 && (
              <ul className="mt-2 space-y-1.5 pl-[18px]">
                {l.accounts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                      <code className="rounded bg-background px-1.5 py-0.5 text-sm font-medium text-foreground">{a.name}</code>
                      {!a.active && " · deactivated"}
                      {a.lastSignIn ? ` · last used ${formatDateTime(a.lastSignIn)}` : " · not used yet"}
                    </span>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setEditing({ division: l, account: a, name: a.name, password: generatePassword() })}>
                      <KeyRound /> {busy === a.id ? "Working…" : "New password"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={busy !== null} onClick={() => setRemoving(a)} aria-label={`Remove ${a.name}`}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.account ? `New password for ${editing.account.name}` : `New check-in login for ${editing?.division.divisionName}`}</DialogTitle>
            <DialogDescription>
              {editing?.account
                ? "Phones already signed in stay signed in. Next time, they sign in with the new password."
                : "The phones at this check-in line sign in with this name and password. Change them to anything you like."}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              {!editing.account && (
                <Field label="Sign-in name" htmlFor="checkin-name" hint={editing.name && checkinName(editing.name) !== editing.name ? `They'll type: ${checkinName(editing.name)}` : "Letters, numbers and dashes, e.g. gate-2."}>
                  <Input id="checkin-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
                </Field>
              )}
              <Field label="Password" htmlFor="checkin-password" hint="At least 8 characters. Shown here so you can read it out.">
                <div className="flex gap-2">
                  <Input id="checkin-password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={8} required className="font-mono" />
                  <Button type="button" variant="outline" onClick={() => setEditing({ ...editing, password: generatePassword() })} title="Make up a new one">
                    <RefreshCw /> <span className="sr-only sm:not-sr-only">Suggest</span>
                  </Button>
                </div>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit">{editing.account ? "Set password" : "Create login"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>Phones signed in with it are signed out and can&apos;t sign in with it again. Check-ins they recorded stay.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => removing && remove(removing)}>
              Remove login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(shown)} onOpenChange={(o) => !o && setShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check-in login for {shown?.division}</DialogTitle>
            <DialogDescription>On each check-in phone, open Kinus and sign in with these. Note the password now: it isn&apos;t shown again.</DialogDescription>
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
