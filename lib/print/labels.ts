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
