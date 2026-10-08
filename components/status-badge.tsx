import { cn } from "@/lib/utils";
import { STATUS_LABEL, type CamperStatus } from "@/lib/attendance/machine";

const DOT: Record<CamperStatus, string> = {
  expected: "bg-status-expected",
  present: "bg-status-present",
  out: "bg-status-out",
  departed: "bg-status-departed",
  no_show: "bg-status-no-show",
};

export function StatusBadge({ status, className }: { status: CamperStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("size-2.5 rounded-full", DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
