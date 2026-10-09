"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ListChecks, Settings, LogOut, Upload, Layers, UserCog, SlidersHorizontal, CalendarDays, LayoutGrid, Tent } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; mobile?: boolean; section?: "main" | "admin" };
const ICONS = { Users, ListChecks, Settings, Upload, Layers, UserCog, SlidersHorizontal, CalendarDays, LayoutGrid };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

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
  const main = nav.filter((n) => n.section !== "admin");
  const admin = nav.filter((n) => n.section === "admin");
  const roleLabel = user.role.replace("_", " ");

  const NavLink = ({ n }: { n: NavItem }) => {
    const Icon = ICONS[n.icon];
    const active = isActive(n.href);
    return (
      <Link
        href={n.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="size-[18px]" />
        {n.label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Tent className="size-5" />
          </div>
          <div className="min-w-0">
            <Link href="/" className="block text-base font-semibold leading-tight">
              Kinus
            </Link>
            {sessionName && <div className="truncate text-xs text-muted-foreground">{sessionName}</div>}
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {main.map((n) => (
            <NavLink key={n.href} n={n} />
          ))}
          {admin.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Admin</div>
              {admin.map((n) => (
                <NavLink key={n.href} n={n} />
              ))}
            </>
          )}
        </nav>
        <div className="m-3 flex items-center gap-3 rounded-xl border bg-background p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">{initials(user.fullName)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.fullName}</div>
            <div className="truncate text-xs capitalize text-muted-foreground">{roleLabel}</div>
          </div>
          <form action={signOutAction}>
            <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" type="submit" title="Sign out" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Tent className="size-4" />
            </span>
            Kinus
            {sessionName && <span className="text-xs font-normal text-muted-foreground">· {sessionName}</span>}
          </Link>
          <form action={signOutAction}>
            <button className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold" type="submit" title="Sign out" aria-label="Sign out">
              {initials(user.fullName)}
            </button>
          </form>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>
        <nav
          className="no-print fixed inset-x-0 bottom-0 z-40 grid border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          style={{ gridTemplateColumns: `repeat(${mobileNav.length}, 1fr)` }}
        >
          {mobileNav.map((n) => {
            const Icon = ICONS[n.icon];
            const active = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-primary-soft")}>
                  <Icon className="size-5" />
                </span>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
