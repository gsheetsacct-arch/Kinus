import type { CurrentUser } from "@/lib/auth/permissions";
import { LEVEL_RANK, canFinalCheckout, canTextStaff, canUsePhoneBook, canUsePrintArea, effectiveLevel, isAdmin, isStaffManager } from "@/lib/auth/permissions";

export type NavIcon = "DoorOpen" | "LayoutGrid" | "Users" | "ListChecks" | "UserCog" | "Upload" | "Layers" | "SlidersHorizontal" | "CalendarDays" | "Settings" | "CircleUser" | "ScanLine" | "Activity" | "Printer" | "UserSearch" | "BookUser" | "ShieldCheck" | "MessageSquare";
export type NavItem = { href: string; label: string; icon: NavIcon; description: string; section: "main" | "admin"; mobile?: boolean };

export function buildNav(user: CurrentUser, opts: { designs?: boolean } = {}): NavItem[] {
  const canScan = LEVEL_RANK[effectiveLevel(user)] >= LEVEL_RANK.scan;
  // the phones at a check-in line: checking in and out, and finding campers and staff. Nothing else.
  if (user.checkinLogin)
    return [
      { href: "/scan", label: "Check in", icon: "ScanLine", description: "Scan or search to check campers in and out", section: "main", mobile: true },
      ...(user.finalCheckout ? [{ href: "/checkout", label: "Final check-out", icon: "DoorOpen" as const, description: "Going home: every division of the camp", section: "main" as const, mobile: true }] : []),
      { href: "/status", label: "Who's here", icon: "Activity", description: "Who's here and who isn't yet, live", section: "main", mobile: true },
      { href: "/campers", label: "Campers", icon: "Users", description: "Find any camper", section: "main", mobile: true },
      { href: "/phone-book", label: "Phone book", icon: "BookUser", description: "Call or text the staff you work with", section: "main" },
    ];
  const nav: NavItem[] = [
    { href: "/", label: "Home", icon: "LayoutGrid", description: "Overview and next steps", section: "main" },
    canScan
      ? { href: "/scan", label: "Check in", icon: "ScanLine", description: "Scan or search to check campers in and out", section: "main", mobile: true }
      : { href: "/scan", label: "Look up", icon: "ScanLine", description: "Scan a tag or search to open a camper", section: "main", mobile: true },
    ...(canFinalCheckout(user) ? [{ href: "/checkout", label: "Final check-out", icon: "DoorOpen" as const, description: "Going home: every division of the camp", section: "main" as const }] : []),
    { href: "/status", label: "Who's here", icon: "Activity", description: "Who's here and who isn't yet, live", section: "main", mobile: true },
    { href: "/campers", label: "Campers", icon: "Users", description: "Find any camper", section: "main", mobile: true },
    { href: "/lists", label: "Lists", icon: "ListChecks", description: "Bunk and division lists to print", section: "main" },
  ];
  if (canUsePhoneBook(user)) nav.push({ href: "/phone-book", label: "Phone book", icon: "BookUser", description: "Call or text the staff you work with", section: "main" });
  if (canTextStaff(user)) nav.push({ href: "/messages", label: "Text staff", icon: "MessageSquare", description: "Text the staff of your divisions", section: "main" });
  if (canUsePrintArea(user)) nav.push({ href: "/print", label: "Print", icon: "Printer", description: "Name and luggage tags: queue, batches, templates", section: "main" });
  else if (opts.designs) nav.push({ href: "/print/templates", label: "Tag designs", icon: "Printer", description: "The name tag and label templates", section: "main" });
  if (isStaffManager(user)) nav.push({ href: "/admin/users", label: "Staff", icon: "UserCog", description: "Invite people and choose what they can see", section: "main" });
  if (isAdmin(user)) {
    nav.push(
      { href: "/admin/imports", label: "Import roster", icon: "Upload", description: "Upload the registration export", section: "admin" },
      { href: "/admin/roles", label: "Roles", icon: "ShieldCheck", description: "What each role can do and see", section: "admin" },
      { href: "/admin/divisions", label: "Divisions & bunks", icon: "Layers", description: "Rename, reorder, merge", section: "admin" },
      { href: "/admin/presets", label: "List layouts", icon: "SlidersHorizontal", description: "Which columns each list shows", section: "admin" },
      { href: "/admin/sessions", label: "Sessions", icon: "CalendarDays", description: "Each year or run of the program", section: "admin" },
      { href: "/admin/settings", label: "Settings", icon: "Settings", description: "Office email, imports, follow-ups", section: "admin" },
    );
  }
  return nav;
}
