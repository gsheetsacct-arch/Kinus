import { cn } from "@/lib/utils";

/** A set of large radio options with a title and a one-line explanation each. */
export function RadioCards({
  name,
  options,
  defaultValue,
  columns = 1,
  disabled,
}: {
  name: string;
  options: { value: string; label: string; description?: string }[];
  defaultValue?: string;
  columns?: 1 | 2 | 3;
  disabled?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50",
            "has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50 has-[:checked]:ring-1 has-[:checked]:ring-primary",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="mt-0.5 size-4 accent-[var(--primary)]" disabled={disabled} />
          <span>
            <span className="block font-medium">{o.label}</span>
            {o.description && <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
