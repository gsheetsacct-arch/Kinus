"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";

type Props = Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => Promise<ActionResult>;
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
  confirm?: string;
};

/** A form that submits to a server action, toasts the outcome and refreshes or redirects. */
export function ActionForm({ action, onSuccess, resetOnSuccess, confirm, children, ...props }: Props) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  return (
    <form
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
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
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
