import Link from "next/link";
import { ChevronRight, CircleUser, LogOut, Users, ListChecks, Settings, Upload, Layers, UserCog, SlidersHorizontal, CalendarDays, LayoutGrid, ScanLine, Activity, Printer, UserSearch } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/current-user";
import { buildNav, type NavItem } from "@/lib/nav";
import { signOut } from "@/app/(auth)/actions";

export const metadata = { title: "More" };
const ICONS = { Users, ListChecks, Settings, Upload, Layers, UserCog, SlidersHorizontal, CalendarDays, LayoutGrid, CircleUser, ScanLine, Activity, Printer, UserSearch };

function Group({ title, items }: { title: string; items: NavItem[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {items.map((n) => {
          const Icon = ICONS[n.icon];
          return (
            <Link key={n.href} href={n.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{n.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{n.description}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default async function MorePage() {
  const user = await requireUser();
  const nav = buildNav(user);
  return (
    <div className="space-y-6">
      <PageHeader title="More" />
      <Group title="Everyday" items={nav.filter((n) => n.section === "main")} />
      <Group title="Setup" items={nav.filter((n) => n.section === "admin")} />
      <Group title="You" items={[{ href: "/account", label: "Your account", icon: "CircleUser", description: "Name, phone and password", section: "main" }]} />
      <form action={signOut}>
        <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5">
          <LogOut className="size-4" /> Sign out
        </button>
      </form>
    </div>
  );
}
