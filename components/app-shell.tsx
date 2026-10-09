"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ListChecks, Settings, LogOut, Upload, Layers, UserCog, SlidersHorizontal, CalendarDays, LayoutGrid, Tent, Menu, CircleUser, ScanLine, Activity, Printer, UserSearch } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";
import { CampSwitcher, type CampOption } from "./camp-switcher";
import { NavigationProgress } from "./navigation-progress";
import { Suspense } from "react";

const ICONS = { Users, ListChecks, Settings, Upload, Layers, UserCog, SlidersHorizontal, CalendarDays, LayoutGrid, CircleUser, ScanLine, Activity, Printer, UserSearch };


export function AppShell({
  nav,
  user,
  sessionName,
  camps,
  currentCamp,
  signOutAction,
  children,
}: {
  nav: NavItem[];
  user: { fullName: string; roleLabel: string };
  sessionName: string | null;
  camps: CampOption[];
  currentCamp: string | null;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const main = nav.filter((n) => n.section === "main");
  const admin = nav.filter((n) => n.section === "admin");
  // four tabs and More: the ones marked for phones first, topped up with the next everyday pages
  const mobileMain = [...main.filter((n) => n.mobile), ...main.filter((n) => !n.mobile && n.href !== "/")].slice(0, 4);
  const moreActive = !mobileMain.some((n) => isActive(n.href)) && pathname !== "/";

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
      <Suspense>
        <NavigationProgress />
      </Suspense>
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Tent className="size-5" />
          </div>
          <div className="min-w-0">
            <Link href="/" className="block text-base font-semibold leading-tight">
              Kinus
            </Link>
            <div className="truncate text-xs text-muted-foreground">{sessionName ?? "No active session"}</div>
          </div>
        </div>
        <CampSwitcher camps={camps} current={currentCamp} className="mx-3 mb-3" />
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {main.map((n) => (
            <NavLink key={n.href} n={n} />
          ))}
          {admin.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Setup</div>
              {admin.map((n) => (
                <NavLink key={n.href} n={n} />
              ))}
            </>
          )}
        </nav>
        <div className="m-3 flex items-center gap-2 rounded-xl border bg-background p-2">
          <Link href="/account" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-muted" title="Your account">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">{initials(user.fullName)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{user.fullName}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.roleLabel} · Account</span>
            </span>
          </Link>
          <form action={signOutAction}>
            <button className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" type="submit" title="Sign out" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Tent className="size-4" />
            </span>
            {/* the session's own name usually says "Kinus" already ("Kinus 5787") */}
            <span className="truncate">{sessionName ?? "Kinus"}</span>
          </Link>
          <CampSwitcher camps={camps} current={currentCamp} className="ml-auto max-w-40" />
          <Link href="/account" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold" title="Your account" aria-label="Your account">
            {initials(user.fullName)}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10">{children}</main>
        <nav
          style={{ gridTemplateColumns: `repeat(${mobileMain.length + 1}, minmax(0, 1fr))` }}
          className="no-print fixed inset-x-0 bottom-0 z-40 grid border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {mobileMain.map((n) => {
            const Icon = ICONS[n.icon];
            const active = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} className={cn("flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-1.5 text-[10px] font-medium leading-tight", active ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("flex h-6 w-10 items-center justify-center rounded-full", active && "bg-primary-soft")}>
                  <Icon className="size-[18px]" />
                </span>
                <span className="max-w-full truncate">{n.label}</span>
              </Link>
            );
          })}
          <Link href="/more" className={cn("flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-1.5 text-[10px] font-medium leading-tight", moreActive ? "text-primary" : "text-muted-foreground")}>
            <span className={cn("flex h-6 w-10 items-center justify-center rounded-full", moreActive && "bg-primary-soft")}>
              <Menu className="size-[18px]" />
            </span>
            More
          </Link>
        </nav>
      </div>
    </div>
  );
}
