"use client";
import * as React from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { deviceName, passkeyErrorMessage, passkeysSupported } from "@/lib/auth/passkey";
import { formatWhen } from "@/lib/utils";
import { signInAgainForPasskey, signedInRecently } from "./actions";

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

/** Face ID / fingerprint sign-in: add one for this device, see and remove the others. */
export function Passkeys() {
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [keys, setKeys] = React.useState<Passkey[] | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = React.useState(false);
  const [pending, start] = React.useTransition();

  const load = React.useCallback(async () => {
    const { data, error } = await createClient().auth.passkey.list();
    if (error) {
      setProblem(passkeyErrorMessage(error));
      setKeys([]);
      return;
    }
    setProblem(null);
    setKeys(Array.isArray(data) ? data : []);
  }, []);
  React.useEffect(() => {
    setSupported(passkeysSupported());
    void load();
  }, [load]);

  const add = () =>
    start(async () => {
      if (!(await signedInRecently())) {
        setNeedsSignIn(true);
        return;
      }
      const supabase = createClient();
      const { data, error } = await supabase.auth.registerPasskey();
      if (error || !data) {
        const msg = passkeyErrorMessage(error);
        if (msg) toast.error(msg);
        return;
      }
      // name it after the device, so a lost phone is easy to find in the list
      const id = (data as { id?: string }).id;
      if (id) await supabase.auth.passkey.update({ passkeyId: id, friendlyName: deviceName() }).catch(() => undefined);
      toast.success("Done. Next time, sign in with Face ID or your fingerprint.");
      await load();
    });

  const remove = (k: Passkey) =>
    start(async () => {
      const { error } = await createClient().auth.passkey.delete({ passkeyId: k.id });
      if (error) return void toast.error(passkeyErrorMessage(error) ?? "Couldn't remove it.");
      toast.success("Removed. That device can't sign in with Face ID any more.");
      await load();
    });

  return (
    <div className="space-y-4">
      {problem && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{problem}</p>}
      {keys && keys.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Fingerprint className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{k.friendly_name || "Passkey"}</span>
                <span className="block text-xs text-muted-foreground">
                  Added {formatWhen(k.created_at)}
                  {k.last_used_at ? ` · last used ${formatWhen(k.last_used_at)}` : ""}
                </span>
              </span>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" disabled={pending} onClick={() => remove(k)} aria-label={`Remove ${k.friendly_name || "passkey"}`}>
                <Trash2 /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {needsSignIn ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <p>For safety, sign in again first (it only takes a moment), then add Face ID or fingerprint right after.</p>
          <form action={signInAgainForPasskey}>
            <Button type="submit" size="sm">
              Sign in again
            </Button>
          </form>
        </div>
      ) : supported === false ? (
        <p className="text-sm text-muted-foreground">This browser can&apos;t use Face ID or fingerprint sign-in. Try Safari on iPhone or Chrome on Android.</p>
      ) : (
        <Button type="button" onClick={add} disabled={pending || supported === null}>
          <Fingerprint /> {pending ? "Waiting for Face ID…" : "Add Face ID or fingerprint on this device"}
        </Button>
      )}
    </div>
  );
}
