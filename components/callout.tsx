import { Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  info: { icon: Info, cls: "border-primary/20 bg-primary-soft/60 text-foreground", iconCls: "text-primary" },
  warning: { icon: AlertTriangle, cls: "border-amber-300/70 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100", iconCls: "text-amber-600" },
  success: { icon: CheckCircle2, cls: "border-status-present/30 bg-status-present/10", iconCls: "text-status-present" },
};

/** A short explanation or warning with an icon. */
export function Callout({ tone = "info", title, children, action, className }: { tone?: keyof typeof TONES; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4 text-sm", t.cls, className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", t.iconCls)} />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="leading-relaxed text-current/90">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
