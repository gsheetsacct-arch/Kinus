import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

/** Label + control + optional hint, with consistent spacing. */
export function Field({ label, hint, htmlFor, className, children }: { label: string; hint?: React.ReactNode; htmlFor?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
