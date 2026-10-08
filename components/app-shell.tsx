"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ListChecks, Settings, LogOut, Upload, Layers, UserCog, SlidersHorizontal, CalendarDays, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; mobile?: boolean };
const ICONS = { Users, ListChecks, Settings, Upload, Layers, UserCog, SlidersHorizontal, CalendarDays, LayoutGrid };

export function AppShell({
  nav,
  user,
  sessionName,
  signOutAction,
  children,
}: {
  nav: NavItem[];
  user: { fullName: string; role: string };
  sessionName: string | null;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const mobileNav = nav.filter((n) => n.mobile !== false).slice(0, 4);

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r bg-muted/30 md:flex">
        <div className="p-4">
          <Link href="/" className="text-lg font-semibold">
            Kinus
          </Link>
          {sessionName && <div className="text-xs text-muted-foreground">{sessionName}</div>}
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {nav.map((n) => {
            const Icon = ICONS[n.icon];
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent",
                  isActive(n.href) && "bg-accent font-medium",
                )}
              >
                <Icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3 text-sm">
          <div className="truncate font-medium">{user.fullName}</div>
          <div className="text-xs capitalize text-muted-foreground">{user.role.replace("_", " ")}</div>
          <form action={signOutAction}>
            <button className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" type="submit">
              <LogOut className="size-3" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between border-b px-4 py-3 md:hidden">
          <Link href="/" className="font-semibold">
            Kinus
          </Link>
          <form action={signOutAction}>
            <button className="text-xs text-muted-foreground" type="submit">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background md:hidden" style={{ gridTemplateColumns: `repeat(${mobileNav.length}, 1fr)` }}>
          {mobileNav.map((n) => {
            const Icon = ICONS[n.icon];
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(n.href) ? "text-foreground font-medium" : "text-muted-foreground")}
              >
                <Icon className="size-5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
