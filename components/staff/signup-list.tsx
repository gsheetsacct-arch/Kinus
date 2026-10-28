"use client";
import * as React from "react";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeSignup } from "@/app/(app)/admin/users/updates/actions";

export function CopyLink({ url }: { url: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
      <Button variant="outline" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Copied."), () => undefined)}>
        <Copy /> Copy
      </Button>
    </div>
  );
}

export function RemoveSignup({ id, name }: { id: string; name: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Take ${name} off the list`}
      onClick={() => {
        if (!confirm(`Take ${name} off the updates list?`)) return;
        start(async () => {
          const r = await removeSignup(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        });
      }}
    >
      <Trash2 /> Remove
    </Button>
  );
}
