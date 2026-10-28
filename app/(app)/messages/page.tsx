import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { Compose, type ComposeCamp } from "@/components/messages/compose";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canTextEveryone, canTextStaff, isAdmin, textableDivisionIds } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { loadTextRecipients } from "@/lib/data/text-recipients";
import { createAdminClient } from "@/lib/supabase/admin";
import { twilioConfig, twilioMissing } from "@/lib/twilio";
import { formatWhen } from "@/lib/utils";

export const metadata = { title: "Text staff" };
// sending to a few hundred staff runs inside this page's action
export const maxDuration = 60;

/** Text the staff of your divisions (directors: everyone, or any divisions), and what was sent before. */
export default async function MessagesPage() {
  const me = await requireUser();
  if (!canTextStaff(me)) redirect("/?denied=head-staff");
  const session = await getActiveSession();
  const admin = createAdminClient();
  const tree = await loadAreaTree(admin, session?.id);
  const allowed = textableDivisionIds(me);
  const divisions = tree.divisions.filter((d) => !allowed || allowed.includes(d.id));
  const firstGroup = tree.groups[0]?.id ?? null;
  const camps: ComposeCamp[] = [
    ...tree.groups.map((g) => ({ id: g.id, name: g.name, divisions: divisions.filter((d) => (d.group_id ?? firstGroup) === g.id) })),
    { id: "none", name: "Other divisions", divisions: divisions.filter((d) => !firstGroup && !d.group_id) },
  ]
    .filter((c) => c.divisions.length)
    .map((c) => ({ ...c, divisions: c.divisions.map(({ id, name, color }) => ({ id, name, color })) }));
  const everyone = canTextEveryone(me);
  // only the people this person may text reach the page (sign-ups only with "everyone")
  const recipients = (await loadTextRecipients(admin, tree)).filter((r) => everyone || r.divisionIds.some((d) => !allowed || allowed.includes(d)));

  // what was sent before: everything for directors over all of camp, otherwise their own and their divisions'
  let history = admin.from("text_broadcasts").select("id, sender_name, body, audience, recipient_count, failed_count, created_at").order("created_at", { ascending: false }).limit(30);
  if (!isAdmin(me)) history = history.or(allowed?.length ? `sent_by.eq.${me.id},division_ids.ov.{${allowed.join(",")}}` : `sent_by.eq.${me.id}`);
  const { data: sent, error } = await history;
  const missing = twilioMissing();

  return (
    <div className="space-y-6">
      <PageHeader title="Text staff" description={everyone ? "Text all staff, or the staff of chosen divisions." : "Text the staff of your divisions."} />
      {error && <Callout tone="warning" title="Texting needs a database update">Apply migration 0039 (Setup workflow or Supabase), then reload.</Callout>}
      {missing.length > 0 && (
        <Callout tone="warning" title="Texting isn't set up yet">
          {isAdmin(me) ? (
            <>
              Add {missing.join(", ")} in Vercel → Settings → Environment Variables, and redeploy. Then, in Twilio, point the number&apos;s incoming messages at{" "}
              <code className="text-xs">/api/twilio/inbound</code> so STOP replies are recorded. See docs/09-deployment.md §9.5b.
            </>
          ) : (
            "A director needs to connect Twilio first."
          )}
        </Callout>
      )}
      <Section title="New text">
        <Compose camps={camps} recipients={recipients} canEveryone={everyone} configured={!missing.length && !error && Boolean(twilioConfig())} />
      </Section>
      {(sent ?? []).length > 0 && (
        <Section title="Sent" bodyClassName="p-0">
          <ul className="divide-y">
            {(sent ?? []).map((b) => (
              <li key={b.id}>
                <Link href={`/messages/${b.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" dir="auto">
                      {b.body}
                    </span>
                    <span className="block text-xs text-muted-foreground" dir="auto">
                      {formatWhen(b.created_at)} · {b.sender_name} → {b.audience} · {b.recipient_count} {b.recipient_count === 1 ? "person" : "people"}
                      {b.failed_count > 0 && <span className="text-destructive"> · {b.failed_count} not sent</span>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
