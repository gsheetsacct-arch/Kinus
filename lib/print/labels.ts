/** Print job statuses as people read them (shared by server pages and client components). */
export const JOB_STATUS: Record<string, { label: string; variant: "outline" | "warning" | "success" | "secondary" | "destructive" }> = {
  queued: { label: "Preparing", variant: "outline" },
  rendering: { label: "Preparing", variant: "outline" },
  ready: { label: "Ready to print", variant: "warning" },
  sent: { label: "Emailed", variant: "warning" },
  printed: { label: "Printed", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

/**
 * While a request's PDF is being made, its `error` holds when that attempt started ("Kinus
 * started at …"), so a request cut off mid-way can be told from one still working. It's
 * bookkeeping, never shown as an error.
 */
export const STARTED_MARK = "Kinus started at ";
export const RETRY_MARK = "Kinus tried again at ";
export const isProgressMark = (e: string | null | undefined) => Boolean(e && (e.startsWith(STARTED_MARK) || e.startsWith(RETRY_MARK)));
export const shownJobError = (e: string | null | undefined) => (e && !isProgressMark(e) ? e : null);
