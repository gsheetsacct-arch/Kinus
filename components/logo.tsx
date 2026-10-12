import { cn } from "@/lib/utils";

/** The Kinus mark: a tent with a flag (the same drawing as the browser-tab icon). */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9 shrink-0", className)} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#00618f" />
      <path d="M32 9.5v7.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M33.3 9.2l8.2 3-8.2 3z" fill="#7dd3fc" />
      <path d="M32 17 51.5 50.5H12.5Z" fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 31.5 40 50.5H24Z" fill="#00618f" />
      <path d="M8.5 52.5h47" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}
