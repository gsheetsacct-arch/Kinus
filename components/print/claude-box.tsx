"use client";
import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDesignLink, removeDesignLink } from "@/app/(app)/print/actions";
import { formatDateTime } from "@/lib/utils";

/**
 * Design with Claude: connects Claude (claude.ai, the Claude app or Claude Code) to Kinus, so it
 * can read, design and preview templates here. One address for everyone, where each person
 * signs in to Kinus (what an organization adds to Claude once), or a personal link.
 */
export function ClaudeBox({ links, connector }: { links: { id: string; label: string; createdAt: string; usedAt?: string }[]; connector: string }) {
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [pending, start] = React.useTransition();
  const make = () =>
    start(async () => {
      const r = await createDesignLink(label || "Claude").catch(() => ({ ok: false as const, error: "Couldn't make the link: try again." }));
      if (!r.ok) return void toast.error(r.error);
      setUrl(r.url);
      setLabel("");
    });
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-muted-foreground" /> Design with Claude
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect your Claude to Kinus: it can read the templates, design and change them with your fonts, pictures and colours, see each change as it prints, and check that every
          camper&apos;s name fits. It works as you, and only on templates.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <p className="font-medium">The Kinus connector: one address for everyone</p>
        <div className="flex gap-2">
          <Input readOnly value={connector} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(connector).then(() => toast.success("Copied."), () => undefined)}>
            <Copy /> Copy
          </Button>
        </div>
        <p className="text-muted-foreground">
          A Claude organization (Team or Enterprise): an owner adds it once, under Organization settings → Connectors → Add custom connector, named “Kinus”. Then each person opens
          Settings → Connectors, clicks Connect next to Kinus and signs in here with their own Kinus account. Personal Claude: add it the same way under Settings → Connectors.
          Anyone who can edit templates can connect; disconnecting is Remove below.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Or a personal link, with the sign-in built in (for Claude Code, or where you can&apos;t sign in):</p>

      {url ? (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary-soft/30 p-3 text-sm">
          <p className="font-medium">Your link (shown once: copy it now, and keep it private like a password)</p>
          <div className="flex gap-2">
            <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">claude.ai or the Claude app:</strong> Settings → Connectors → Add custom connector. Name it “Kinus”, paste the link, Add. In a chat,
              turn on Kinus under the tools (+) menu.
            </li>
            <li>
              <strong className="text-foreground">Claude Code:</strong> <code className="rounded bg-muted px-1">claude mcp add --transport http kinus &lt;the link&gt;</code>
            </li>
            <li>Then ask, e.g. “Show me the Kinus name tag template and redesign it in our camp style with the Camp Display font. Preview it with the longest names.”</li>
          </ol>
          <Button size="sm" variant="ghost" onClick={() => setUrl(null)}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Which Claude (e.g. Moshe's laptop)" className="w-64" />
          <Button size="sm" disabled={pending} onClick={make}>
            <Sparkles /> Make a link
          </Button>
        </div>
      )}

      {links.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.label}</span>
                <span className="block text-xs text-muted-foreground">
                  Made {formatDateTime(l.createdAt)}
                  {l.usedAt ? ` · last used ${formatDateTime(l.usedAt)}` : " · not used yet"}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                aria-label={`Remove ${l.label}`}
                onClick={() =>
                  start(async () => {
                    const r = await removeDesignLink(l.id);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  })
                }
              >
                <Trash2 /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
