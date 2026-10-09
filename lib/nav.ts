import type { CurrentUser } from "@/lib/auth/permissions";
import { isAdmin, isDirector } from "@/lib/auth/permissions";

export type NavIcon = "LayoutGrid" | "Users" | "ListChecks" | "UserCog" | "Upload" | "Layers" | "SlidersHorizontal" | "CalendarDays" | "Settings" | "CircleUser" | "ScanLine" | "Activity" | "Printer";
export type NavItem = { href: string; label: string; icon: NavIcon; description: string; section: "main" | "admin"; mobile?: boolean };

export function buildNav(user: CurrentUser): NavItem[] {
  const nav: NavItem[] = [
    { href: "/", label: "Home", icon: "LayoutGrid", description: "Overview and next steps", section: "main" },
    { href: "/scan", label: "Check in", icon: "ScanLine", description: "Scan or search to check campers in and out", section: "main", mobile: true },
    { href: "/campers", label: "Campers", icon: "Users", description: "Find any camper", section: "main", mobile: true },
    { href: "/lists", label: "Lists", icon: "ListChecks", description: "Bunk and division lists to print", section: "main" },
  ];

  if (isDirector(user)) nav.push({ href: "/admin/users", label: "Staff", icon: "UserCog", description: "Invite people and choose what they can see", section: "main" });
  if (isAdmin(user)) {
    nav.push(
      { href: "/admin/imports", label: "Import roster", icon: "Upload", description: "Upload the registration export", section: "admin" },
      { href: "/admin/divisions", label: "Divisions & bunks", icon: "Layers", description: "Rename, reorder, merge", section: "admin" },
      { href: "/admin/presets", label: "List layouts", icon: "SlidersHorizontal", description: "Which columns each list shows", section: "admin" },
      { href: "/admin/sessions", label: "Sessions", icon: "CalendarDays", description: "Each year or run of the program", section: "admin" },
      { href: "/admin/settings", label: "Settings", icon: "Settings", description: "Privacy, office email, imports", section: "admin" },
    );
  }
  return nav;
}
