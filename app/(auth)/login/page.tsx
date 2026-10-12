import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { HashSession } from "./hash-session";
import { LoginForm } from "./login-form";
import { PasskeySignIn } from "@/components/auth/passkey-sign-in";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const { data } = await (await createClient()).auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-black/10" />
        <div className="relative flex items-center gap-3">
          <Logo className="size-11 rounded-2xl ring-2 ring-white/25" />
          <span className="text-xl font-semibold">Kinus</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Every camper, accounted for.</h1>
          <p className="mt-4 text-lg text-primary-foreground/80">Check-in and check-out, live status by bunk, lists for every role, and name tags on demand.</p>
        </div>
        <div className="relative text-sm text-primary-foreground/60">Staff access only.</div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo className="size-10" />
            <span className="text-lg font-semibold">Kinus</span>
          </div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">Use the email your invitation was sent to.</p>
          {error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{decodeURIComponent(error)}</p>}
          <HashSession next={safeNext} signedIn={Boolean(user)} />
          <PasskeySignIn next={safeNext} />
          <LoginForm next={safeNext} />
        </div>
      </section>
    </main>
  );
}
