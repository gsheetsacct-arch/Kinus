import { cn } from "@/lib/utils";
import { STATUS_LABEL, type CamperStatus } from "@/lib/attendance/machine";

const STYLE: Record<CamperStatus, { dot: string; pill: string }> = {
  expected: { dot: "bg-status-expected", pill: "bg-muted text-muted-foreground" },
  present: { dot: "bg-status-present", pill: "bg-status-present/12 text-status-present" },
  out: { dot: "bg-status-out", pill: "bg-status-out/20 text-amber-900 dark:text-amber-200" },
  departed: { dot: "bg-status-departed", pill: "bg-status-departed/12 text-status-departed" },
  no_show: { dot: "bg-status-no-show", pill: "bg-status-no-show/10 text-status-no-show" },
};

export function StatusBadge({ status, className }: { status: CamperStatus; className?: string }) {
  const s = STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", s.pill, className)}>
      <span className={cn("size-2 rounded-full", s.dot)} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
