"use client";
import * as React from "react";
import { Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { passkeyErrorMessage, passkeysSupported } from "@/lib/auth/passkey";

/** "Sign in with Face ID or fingerprint": no email, no password, for people who set it up. */
export function PasskeySignIn({ next }: { next: string }) {
  const [supported, setSupported] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => setSupported(passkeysSupported()), []);
  if (!supported) return null;
  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const { data, error } = await createClient().auth.signInWithPasskey();
            if (error || !data?.session) {
              const msg = passkeyErrorMessage(error);
              if (msg) toast.error(msg);
              return;
            }
            // a full load, so the server sees the new session cookies
            window.location.assign(next);
          } catch (e) {
            const msg = passkeyErrorMessage(e);
            if (msg) toast.error(msg);
          } finally {
            setPending(false);
          }
        }}
      >
        <Fingerprint /> {pending ? "Waiting for Face ID…" : "Sign in with Face ID or fingerprint"}
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
