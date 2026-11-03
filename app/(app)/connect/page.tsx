import { redirect } from "next/navigation";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ClaudeBox } from "@/components/print/claude-box";
import { requireUser } from "@/lib/auth/current-user";
import { appUrl } from "@/lib/auth/app-url";
import { canConnect } from "@/lib/ai/connect";
import { connectorsOf } from "@/lib/print/design-connectors";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Connect your AI" };

/** Claude to Kinus, for anyone with their own sign-in: how, what to ask, and their connections. */
export default async function ConnectPage() {
  const user = await requireUser();
  if (!canConnect(user)) redirect("/");
  const [links, connector] = await Promise.all([connectorsOf(user.id), appUrl().then((u) => `${u}/api/mcp`)]);
  const lastUsed = links.map((l) => l.usedAt).filter((x): x is string => Boolean(x)).sort().pop();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Connect your AI"
        description="Claude can work with Kinus as you: it knows how everything here is set up, so you can ask it how to upload a file, where something is, why a tag looks the way it does, and have it do what your account may do."
      />

      <section className="space-y-3 rounded-xl border-2 border-primary/30 bg-primary-soft/30 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-primary" /> Two steps
        </h2>
        {links.length > 0 ? (
          <p className="flex items-center gap-2 text-sm font-medium text-status-present">
            <CheckCircle2 className="size-4" /> Connected{lastUsed ? `: last used ${formatDateTime(lastUsed)}` : ""}.
          </p>
        ) : null}
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            <strong>Your organization already has the Kinus connector in Claude.</strong> Open Claude → <strong>Settings → Connectors</strong>, and click <strong>Connect</strong> next to
            Kinus.
          </li>
          <li>
            <strong>Sign in</strong> with your Kinus account when it asks, and press <strong>Allow</strong>. That&apos;s all.
          </li>
        </ol>
        <Button asChild>
          <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">
            <ExternalLink /> Open Claude&apos;s connectors
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">In a chat, make sure Kinus is turned on under the tools (+) menu. It works in the Claude app and on claude.ai.</p>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-semibold">Things to ask it</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>“How should I prepare the staff list to upload?” · “What columns does the registration export need?”</li>
          <li>“I have a file with registration IDs and bus numbers: how do I add it?”</li>
          <li>“Which campers in Division 2 have no Hebrew name yet? Fix the ones you&apos;re sure of.”</li>
          <li>“Queue the packing labels for Division 2, sorted by name.”</li>
          <li>“How do I make a counselor list with T-shirt, sleeping and yarmulka in one column?”</li>
          <li>“Why does this camper&apos;s luggage tag say ‘no bunk’?”</li>
        </ul>
        <p className="text-xs text-muted-foreground">It only does what your account may do, and its changes are in the activity log under your name.</p>
      </section>

      <ClaudeBox links={links} connector={connector} />
    </div>
  );
}
