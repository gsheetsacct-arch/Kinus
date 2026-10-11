"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LeaveGuard } from "@/components/leave-guard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/actions/result";

type Props = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => Promise<ActionResult>;
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
  /** Ask first, in the app's own dialog: the question, then an optional detail line. */
  confirm?: string;
  confirmDetail?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Mark the form unsaved once it's edited (data-dirty, for an "Unsaved changes" hint) and ask before leaving. */
  warnUnsaved?: boolean;
};

/**
 * A form that submits to a server action, toasts the outcome and refreshes or redirects.
 * Layout classes apply to the form itself, so `space-y-*` and `grid gap-*` space its fields.
 */
export function ActionForm({ action, onSuccess, resetOnSuccess, confirm, confirmDetail, confirmLabel, danger, warnUnsaved, children, className, ...props }: Props) {
  const [pending, startTransition] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);
  const [asking, setAsking] = React.useState<{
    form: HTMLFormElement;
    fd: FormData;
  } | null>(null);
  const router = useRouter();
  const run = (form: HTMLFormElement, fd: FormData) =>
    startTransition(async () => {
      const r = await action(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.message) toast.success(r.message);
      setDirty(false);
      if (resetOnSuccess) form.reset();
      onSuccess?.();
      if (r.redirect) router.push(r.redirect);
      else router.refresh();
    });
  return (
    <>
      <form
        {...props}
        className={cn(className, pending && "pointer-events-none opacity-60 transition-opacity")}
        aria-busy={pending}
        data-dirty={warnUnsaved && dirty ? "true" : undefined}
        onChange={warnUnsaved ? () => setDirty(true) : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const form = e.currentTarget;
          const fd = new FormData(form);
          if (confirm) setAsking({ form, fd });
          else run(form, fd);
        }}
      >
        {children}
      </form>
      {warnUnsaved && <LeaveGuard dirty={dirty} />}
      {confirm && (
        <Dialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirm}</DialogTitle>
              {confirmDetail && <DialogDescription>{confirmDetail}</DialogDescription>}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <Button
                variant={danger ? "destructive" : "default"}
                onClick={() => {
                  if (asking) run(asking.form, asking.fd);
                  setAsking(null);
                }}
              >
                {confirmLabel ?? "Yes, go ahead"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
