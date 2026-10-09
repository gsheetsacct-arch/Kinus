import { AppShell, type NavItem } from "@/components/app-shell";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { isAdmin, isDirectorOrAbove } from "@/lib/auth/permissions";
import { signOut } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const session = await getActiveSession();
  const nav: NavItem[] = [
    { href: "/", label: "Home", icon: "LayoutGrid" },
    { href: "/campers", label: "Campers", icon: "Users" },
    { href: "/lists", label: "Lists", icon: "ListChecks" },
  ];
  if (isDirectorOrAbove(user)) nav.push({ href: "/admin/users", label: "Staff", icon: "UserCog" });
  if (isAdmin(user)) {
    nav.push(
      { href: "/admin/imports", label: "Imports", icon: "Upload", mobile: false, section: "admin" },
      { href: "/admin/divisions", label: "Divisions & bunks", icon: "Layers", mobile: false, section: "admin" },
      { href: "/admin/presets", label: "List presets", icon: "SlidersHorizontal", mobile: false, section: "admin" },
      { href: "/admin/sessions", label: "Sessions", icon: "CalendarDays", mobile: false, section: "admin" },
      { href: "/admin/settings", label: "Settings", icon: "Settings", mobile: false, section: "admin" },
    );
  }
  return (
    <AppShell nav={nav} user={{ fullName: user.fullName, role: user.role }} sessionName={session?.name ?? null} signOutAction={signOut}>
      {children}
    </AppShell>
  );
}
