"use client";
import * as React from "react";
import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KEY = "kinus:ai-prompt";

/**
 * For someone who hasn't connected their AI yet: once on this device, "Connect your AI" (the
 * organization's Claude already has the Kinus connector: Connect and sign in). "Not now" and
 * connecting both stop it; the Connect your AI page is in the menu any time.
 */
export function ConnectAiPrompt() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {}
  }, []);
  const done = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && done()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Connect your AI
          </DialogTitle>
          <DialogDescription>
            Claude can work with Kinus as you: ask it how to upload a file, how to set something up, why a tag looks the way it does, and have it do what your account may do.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Claude already has the Kinus connector from the organization. Open Claude → <strong>Settings → Connectors</strong> and click <strong>Connect</strong> next to Kinus.
          </li>
          <li>
            <strong>Sign in</strong> with your Kinus account and press <strong>Allow</strong>.
          </li>
        </ol>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild onClick={done}>
            <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">
              <ExternalLink /> Connect in Claude
            </a>
          </Button>
          <Button variant="outline" asChild onClick={done}>
            <Link href="/connect">More about it</Link>
          </Button>
          <Button variant="ghost" onClick={done}>
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
