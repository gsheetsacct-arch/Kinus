"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/result";

type Props = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => Promise<ActionResult>;
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
  confirm?: string;
};

/**
 * A form that submits to a server action, toasts the outcome and refreshes or redirects.
 * Layout classes apply to the form itself, so `space-y-*` and `grid gap-*` space its fields.
 */
export function ActionForm({ action, onSuccess, resetOnSuccess, confirm, children, className, ...props }: Props) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  return (
    <form
      {...props}
      className={cn(className, pending && "pointer-events-none opacity-60 transition-opacity")}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const form = e.currentTarget;
        const fd = new FormData(form);
        startTransition(async () => {
          const r = await action(fd);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          if (r.message) toast.success(r.message);
          if (resetOnSuccess) form.reset();
          onSuccess?.();
          if (r.redirect) router.push(r.redirect);
          else router.refresh();
        });
      }}
    >
      {children}
    </form>
  );
}
