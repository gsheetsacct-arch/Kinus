"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Queue · Print a batch · Templates · Fields */
export function PrintTabs({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/print", label: "Queue", match: (p: string) => p === "/print" || p.startsWith("/print/jobs") },
    { href: "/print/batch", label: "Print a batch", match: (p: string) => p.startsWith("/print/batch") },
    ...(admin
      ? [
          { href: "/print/templates", label: "Templates", match: (p: string) => p.startsWith("/print/templates") },
          { href: "/print/fields", label: "Fields & conversions", match: (p: string) => p.startsWith("/print/fields") },
        ]
      : []),
  ];
  return (
    <nav className="no-print -mx-4 mb-6 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0" aria-label="Print area">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium", active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
