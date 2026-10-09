import { AppShell } from "@/components/app-shell";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { buildNav } from "@/lib/nav";
import { STAFF_ROLES } from "@/lib/labels";
import { signOut } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const session = await getActiveSession();
  return (
    <AppShell nav={buildNav(user)} user={{ fullName: user.fullName, roleLabel: STAFF_ROLES[user.role].label }} sessionName={session?.name ?? null} signOutAction={signOut}>
      {children}
    </AppShell>
  );
}
