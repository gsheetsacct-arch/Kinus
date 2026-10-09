import Link from "next/link";
import { redirect } from "next/navigation";
import { Tent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccountProblem, getCurrentUser } from "@/lib/auth/current-user";
import { signOut } from "../actions";

export const metadata = { title: "Can't open Kinus" };
export const dynamic = "force-dynamic";

const COPY = {
  database: {
    title: "Kinus is waiting for a database update",
    body: "You're signed in, but the database hasn't caught up with the latest version of the app, so your account can't be read yet. Whoever manages Kinus needs to run the newest migration in Supabase (Database → Migrations, or the SQL editor). This page works again as soon as it's done.",
  },
  inactive: {
    title: "Your account is turned off",
    body: "You're signed in, but a director deactivated this account. Ask them to reactivate it if you still need access.",
  },
  no_profile: {
    title: "Your account isn't set up yet",
    body: "You're signed in, but there's no staff record for this email. Ask a director to add you under Staff, using this same email address.",
  },
} as const;

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const problem = (await getAccountProblem()) ?? ((await searchParams).reason as keyof typeof COPY | undefined);
  if (!problem || !(problem in COPY)) redirect("/login");
  const c = COPY[problem];
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)]">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Tent className="size-5" />
        </span>
        <h1 className="text-xl font-semibold">{c.title}</h1>
        <p className="text-sm text-muted-foreground">{c.body}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/">Try again</Link>
          </Button>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
