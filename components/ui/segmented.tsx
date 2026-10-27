"use client";
import { cn } from "@/lib/utils";

/**
 * A bar of options side by side, one chosen (like a radio group): every choice in view at
 * once, one tap to change. Wraps on a narrow screen. Sends `name` with a form.
 */
export function Segmented<T extends string>({ name, value, options, onChange, className }: { name?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="radiogroup" className={cn("flex flex-wrap gap-1 rounded-lg bg-muted p-1", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-9 flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
            o.value === value ? "bg-background text-foreground shadow-sm ring-1 ring-primary" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
