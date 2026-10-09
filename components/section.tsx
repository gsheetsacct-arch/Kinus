import { cn } from "@/lib/utils";

/** A titled card. Every page is built from these so spacing is the same everywhere. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  tone,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "danger";
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-[var(--shadow-card)]", tone === "danger" && "border-destructive/30", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className={cn("text-base font-semibold", tone === "danger" && "text-destructive")}>{title}</h2>}
            {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children !== undefined && <div className={cn("p-5", bodyClassName)}>{children}</div>}
    </section>
  );
}
