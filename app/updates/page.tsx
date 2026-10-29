import Link from "next/link";
import { Logo } from "@/components/logo";
import { UPDATES_CONSENT } from "@/lib/update-signups";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Get updates from the directors" };

/** Staff sign up for text updates from the directors: open to anyone with the link, no account. */
export default function UpdatesPage() {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-muted/40 p-4 sm:items-center sm:p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-xl font-semibold leading-tight">Get updates from the directors</h1>
            <p className="text-sm text-muted-foreground">For camp staff: news and reminders by text.</p>
          </div>
        </div>
        <SignupForm consent={UPDATES_CONSENT} />
        <p className="text-xs text-muted-foreground">
          Your number is only for updates from camp. It isn&apos;t shared or sold. See the{" "}
          <Link href="/terms" className="underline">
            text message terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
