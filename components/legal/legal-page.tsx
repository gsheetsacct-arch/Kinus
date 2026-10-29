import Link from "next/link";
import { Logo } from "@/components/logo";

/** A public page of plain text (privacy policy, terms): no sign-in, readable on a phone. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-muted/40 p-4 sm:p-6">
      <article className="mx-auto w-full max-w-2xl space-y-5 rounded-xl border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
        <header className="flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-xl font-semibold leading-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">Last updated {updated}</p>
          </div>
        </header>
        <div className="space-y-4 text-sm leading-relaxed [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
        <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:underline">
            Privacy policy
          </Link>
          <Link href="/terms" className="hover:underline">
            Text message terms
          </Link>
          <Link href="/updates" className="hover:underline">
            Sign up for updates
          </Link>
        </footer>
      </article>
    </main>
  );
}
