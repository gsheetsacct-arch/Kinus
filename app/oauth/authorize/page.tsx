import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canDesign } from "@/lib/print/designers";
import { allowedRedirect, issueCode, readClient } from "@/lib/oauth";
import { appUrl } from "@/lib/auth/app-url";

export const metadata = { title: "Connect Claude" };

type Ask = { response_type?: string; client_id?: string; redirect_uri?: string; code_challenge?: string; code_challenge_method?: string; state?: string };

/** The request checked: what's wrong with it before it can go back to Claude, or where to send the answer. */
function check(a: Ask): { error: string } | { client: { name: string }; back: (params: Record<string, string>) => string } {
  const client = readClient(a.client_id ?? "");
  if (!client) return { error: "This connection request doesn't come from a registered app. Start again from Claude." };
  const uri = a.redirect_uri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "");
  if (!uri || !client.redirect_uris.includes(uri) || !allowedRedirect(uri)) return { error: "This connection request doesn't say where to go back to in Claude." };
  return {
    client,
    back: (params) => {
      const u = new URL(uri);
      for (const [k, v] of Object.entries({ ...params, ...(a.state ? { state: a.state } : {}) })) u.searchParams.set(k, v);
      return u.toString();
    },
  };
}

/**
 * Claude asks to connect to this person's Kinus (the design connector at /api/mcp): they're
 * signed in (or sent to sign in and back), see what it may do, and allow it or not.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Ask> }) {
  const ask = await searchParams;
  const user = await getCurrentUser();
  const req = check(ask);

  async function allow(formData: FormData) {
    "use server";
    const a = JSON.parse(String(formData.get("ask") ?? "{}")) as Ask;
    const r = check(a);
    const me = await getCurrentUser();
    if ("error" in r || !me || !(await canDesign(me))) redirect("/oauth/authorize?" + new URLSearchParams(a as Record<string, string>).toString());
    if (a.response_type !== "code" || a.code_challenge_method !== "S256" || !a.code_challenge) redirect(r.back({ error: "invalid_request", error_description: "PKCE (S256) is required." }));
    redirect(r.back({ code: issueCode(me.id, a.client_id!, a.redirect_uri ?? readClient(a.client_id!)!.redirect_uris[0], a.code_challenge), iss: await appUrl() }));
  }

  let body: React.ReactNode;
  if ("error" in req) body = <p className="text-sm text-destructive">{req.error}</p>;
  else if (!user) body = <p className="text-sm text-muted-foreground">Your Kinus account can&apos;t be used right now. Ask a director.</p>;
  else if (!(await canDesign(user)))
    body = <p className="text-sm text-muted-foreground">{user.fullName}, you can&apos;t edit templates in Kinus, so there&apos;s nothing to connect. A director can let you design templates (Print → Templates).</p>;
  else
    body = (
      <>
        <p className="text-sm">
          <strong>{req.client.name}</strong> wants to work on Kinus templates as <strong>{user.fullName}</strong>.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Read, design and change label and tag templates, with your fonts and pictures.</li>
          <li>Preview them with campers&apos; names, to check that every name fits.</li>
          <li>Nothing else: no check-ins, lists, contacts or medical details.</li>
        </ul>
        <p className="text-xs text-muted-foreground">You can disconnect it any time: Print → Templates → Design with Claude → Remove.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <form action={allow}>
            <input type="hidden" name="ask" value={JSON.stringify(ask)} />
            <Button type="submit">
              <Sparkles /> Allow
            </Button>
          </form>
          <Button asChild variant="outline">
            <a href={req.back({ error: "access_denied" })}>Cancel</a>
          </Button>
        </div>
      </>
    );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
          <h1 className="text-xl font-semibold">Connect Claude to Kinus</h1>
        </div>
        {body}
      </div>
    </main>
  );
}
