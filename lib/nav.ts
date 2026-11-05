import type { CurrentUser } from "@/lib/auth/permissions";
import { canSeeHelp } from "@/lib/help/access";
import { canConnect } from "@/lib/ai/connect";
import { LEVEL_RANK, canAddCheckinLogins, canFinalCheckout, canPrintCheckin, canTextStaff, canUsePhoneBook, canUsePrintArea, effectiveLevel, isAdmin, isDirector, isStaffManager } from "@/lib/auth/permissions";

export type NavIcon = "DoorOpen" | "LayoutGrid" | "Users" | "ListChecks" | "UserCog" | "Upload" | "Layers" | "SlidersHorizontal" | "CalendarDays" | "Settings" | "CircleUser" | "ScanLine" | "Activity" | "Printer" | "UserSearch" | "BookUser" | "ShieldCheck" | "MessageSquare" | "ClipboardCheck" | "History" | "Search" | "CircleHelp" | "Sparkles" | "KeyRound";
export type NavItem = { href: string; label: string; icon: NavIcon; description: string; section: "main" | "admin"; mobile?: boolean };

export function buildNav(user: CurrentUser, opts: { designs?: boolean } = {}): NavItem[] {
  const canScan = LEVEL_RANK[effectiveLevel(user)] >= LEVEL_RANK.scan;
  // the phones at a check-in line: checking in and out, and finding campers and staff. Nothing else.
  if (user.checkinLogin)
    return [
      { href: "/scan", label: "Check in", icon: "ScanLine", description: "Scan or search to check campers in and out", section: "main", mobile: true },
      ...(user.finalCheckout ? [{ href: "/checkout", label: "Final check-out", icon: "DoorOpen" as const, description: "Going home: every division of the camp", section: "main" as const, mobile: true }] : []),
      { href: "/status", label: "Who's here", icon: "Activity", description: "Who's here and who isn't yet, live", section: "main", mobile: true },
      { href: "/counts", label: "Head counts", icon: "ClipboardCheck", description: "Count who's on a bus or trip", section: "main", mobile: true },
      { href: "/campers", label: "Campers", icon: "Users", description: "Find any camper", section: "main", mobile: true },
      { href: "/phone-book", label: "Phone book", icon: "BookUser", description: "Call or text the staff you work with", section: "main" },
      { href: "/print", label: "Print labels", icon: "Printer", description: "Your divisions' label-printer labels", section: "main" },
      { href: "/checkin-logins", label: "Check-in logins", icon: "KeyRound", description: "Add a login for another check-in phone", section: "main" },
    ];
  const nav: NavItem[] = [
    { href: "/", label: "Home", icon: "LayoutGrid", description: "Overview and next steps", section: "main" },
    { href: "/search", label: "Search", icon: "Search", description: "Search all of Kinus, or one part of it", section: "main" },
    canScan
      ? { href: "/scan", label: "Check in", icon: "ScanLine", description: "Scan or search to check campers in and out", section: "main", mobile: true }
      : { href: "/scan", label: "Look up", icon: "ScanLine", description: "Scan a tag or search to open a camper", section: "main", mobile: true },
    ...(canFinalCheckout(user) ? [{ href: "/checkout", label: "Final check-out", icon: "DoorOpen" as const, description: "Going home: every division of the camp", section: "main" as const }] : []),
    { href: "/status", label: "Who's here", icon: "Activity", description: "Who's here and who isn't yet, live", section: "main", mobile: true },
    ...(canScan ? [{ href: "/counts", label: "Head counts", icon: "ClipboardCheck" as const, description: "Count who's on a bus or trip", section: "main" as const }] : []),
    { href: "/campers", label: "Campers", icon: "Users", description: "Find any camper", section: "main", mobile: true },
    { href: "/lists", label: "Lists", icon: "ListChecks", description: "Bunk and division lists to print", section: "main" },
  ];
  if (canUsePhoneBook(user)) nav.push({ href: "/phone-book", label: "Phone book", icon: "BookUser", description: "Call or text the staff you work with", section: "main" });
  if (canTextStaff(user)) nav.push({ href: "/messages", label: "Text staff", icon: "MessageSquare", description: "Text the staff of your divisions", section: "main" });
  if (canUsePrintArea(user)) nav.push({ href: "/print", label: "Print", icon: "Printer", description: "Name and luggage tags: queue, batches, templates", section: "main" });
  else if (canPrintCheckin(user)) nav.push({ href: "/print", label: "Print labels", icon: "Printer", description: "Your divisions' label-printer labels", section: "main" });
  else if (opts.designs) nav.push({ href: "/print/templates", label: "Tag designs", icon: "Printer", description: "The name tag and label templates", section: "main" });
  if (canAddCheckinLogins(user)) nav.push({ href: "/checkin-logins", label: "Check-in logins", icon: "KeyRound", description: "Add a login for another check-in phone", section: "main" });
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
  // the activity log: owners and directors
  if (isDirector(user)) nav.push({ href: "/admin/activity", label: "Activity", icon: "History", description: "Who changed what, and when", section: "admin" });
  // the guide, and connecting an AI that has it
  if (canSeeHelp(user)) nav.push({ href: "/help", label: "Help", icon: "CircleHelp", description: "How everything is set up, and how to do each job", section: "main" });
  if (canConnect(user)) nav.push({ href: "/connect", label: "Connect your AI", icon: "Sparkles", description: "Use Kinus with Claude: it knows how everything here works", section: "main" });
  return nav;
}
