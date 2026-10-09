"use client";
import * as React from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/action-form";
import type { ActionResult } from "@/lib/actions/result";

/**
 * A button that opens a dialog with a form. Closes itself when the action succeeds.
 * With `confirmText`, the submit button stays disabled until that text is typed.
 */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Save",
  destructive,
  confirmText,
  children,
  wide,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action: (fd: FormData) => Promise<ActionResult>;
  submitLabel?: string;
  destructive?: boolean;
  confirmText?: string;
  children?: React.ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setTyped("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={wide ? "max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        <ActionForm action={action} onSuccess={() => setOpen(false)} className="space-y-5">
          {children}
          {confirmText && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-text">
                Type <span className="font-semibold">{confirmText}</span> to confirm
              </Label>
              <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" dir="auto" />
            </div>
          )}
          <DialogFooter className="pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={confirmText ? typed.trim() !== confirmText.trim() : false}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
