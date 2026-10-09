import { AppShell } from "@/components/app-shell";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { buildNav } from "@/lib/nav";
import { STAFF_ROLES } from "@/lib/labels";
import { signOut } from "@/app/(auth)/actions";
import { getCampContext } from "@/lib/data/camp";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [session, camp] = await Promise.all([getActiveSession(), getCampContext()]);
  return (
    <AppShell
      nav={buildNav(user)}
      user={{ fullName: user.fullName, roleLabel: STAFF_ROLES[user.role].label }}
      sessionName={session?.name ?? null}
      camps={camp.camps.map(({ id, name }) => ({ id, name }))}
      currentCamp={camp.current?.id ?? null}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
