import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Markdown } from "@/components/help/markdown";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/current-user";
import { canSeeHelp } from "@/lib/help/access";
import { GUIDE, LIVE_SECTION } from "@/lib/help/guide";
import { liveSetup } from "@/lib/help/live";

export const metadata = { title: "Help" };

/**
 * The Kinus guide (lib/help/guide): how everything is set up and how to do each job. The same
 * text is what the Kinus connector gives the AI people use.
 */
export default async function HelpPage() {
  const user = await requireUser();
  if (!canSeeHelp(user)) redirect("/");
  // the actual settings, read live: what the written guide marks ⚙ Setting
  const live = await liveSetup().catch((e) => (console.error("Reading the live setup failed", e), "Couldn't read the settings just now: reload the page."));
  const sections = [GUIDE[0], { ...LIVE_SECTION, body: live }, ...GUIDE.slice(1)];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Help"
        description="How Kinus is set up and how to do each job: imports, columns, Hebrew names, check-in, printing, the templates and their paper, lists, staff. Your AI has this same guide, so you can also just ask it."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/connect">
              <Sparkles /> Ask your AI
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* contents */}
        <nav className="no-print lg:sticky lg:top-4 lg:self-start" aria-label="Contents">
          <ul className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-4">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-20 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-xl font-semibold">{s.title}</h2>
              <p className="text-sm text-muted-foreground">{s.summary}</p>
              <Markdown text={s.body} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
