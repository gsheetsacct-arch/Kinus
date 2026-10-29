import { Logo } from "@/components/logo";
import { contactEmail } from "@/lib/legal";
import { ORGANIZATION, UPDATES_ABOUT, UPDATES_CONSENT, UPDATES_FREQUENCY } from "@/lib/update-signups";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Get updates from the directors" };
export const dynamic = "force-dynamic";

/**
 * Staff sign up for text updates from the directors: open to anyone with the link, no account.
 * Laid out as carriers ask of a web opt-in (A2P 10DLC): who sends what and how often, an unticked
 * consent box of its own, a separate box for the terms and privacy policy, rates, HELP and STOP.
 */
export default async function UpdatesPage() {
  const email = await contactEmail();
  return (
    <main className="flex min-h-dvh items-start justify-center bg-muted/40 p-4 sm:items-center sm:p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-xl font-semibold leading-tight">Get text updates from {ORGANIZATION}</h1>
            <p className="text-sm text-muted-foreground">For camp staff, from the camp directors.</p>
          </div>
        </div>
        <p className="text-sm">
          {UPDATES_ABOUT} {UPDATES_FREQUENCY}
        </p>
        <SignupForm consent={UPDATES_CONSENT} />
        <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Msg &amp; data rates may apply.</strong> {UPDATES_FREQUENCY} Signing up is not a condition of working at or attending camp.
          </p>
          <p>
            Reply <strong className="text-foreground">STOP</strong> to opt out at any time. Reply <strong className="text-foreground">HELP</strong> for help
            {email ? (
              <>
                {" "}
                or contact us at{" "}
                <a href={`mailto:${email}`} className="underline">
                  {email}
                </a>
              </>
            ) : null}
            .
          </p>
          <p>
            Your number is used only for messages from camp, never shared or sold. For more information, see our{" "}
            <a href="/terms" className="underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
