import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { Compose, type ComposeCamp } from "@/components/messages/compose";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { canTextEveryone, canTextStaff, isAdmin, textableDivisionIds, textableRoles } from "@/lib/auth/permissions";
import { loadAreaTree } from "@/lib/data/areas";
import { loadTextRecipients } from "@/lib/data/text-recipients";
import { createAdminClient } from "@/lib/supabase/admin";
import { twilioConfig, twilioMissing } from "@/lib/twilio";
import { CAMP } from "@/lib/update-signups";
import { formatWhen } from "@/lib/utils";
import { ReplyList } from "@/components/messages/reply-list";
import { replyDivisions, replyVisibility } from "@/lib/data/reply-access";
import type { Reply } from "@/components/messages/reply-list";
import { ROLE_ORDER, STAFF_ROLES } from "@/lib/labels";

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
  const everybody = await loadTextRecipients(admin, tree);
  // and only the roles their role may text (Staff → Roles); sign-ups have no role, so not then
  const onlyRoles = textableRoles(me);
  const recipients = everybody.filter((r) => (everyone || r.divisionIds.some((d) => !allowed || allowed.includes(d))) && (!onlyRoles || (r.role !== null && onlyRoles.includes(r.role as never))));

  // what was sent before: everything for directors over all of camp, otherwise their own and their divisions'
  let history = admin.from("text_broadcasts").select("id, sender_name, body, audience, recipient_count, failed_count, created_at").order("created_at", { ascending: false }).limit(30);
  if (!isAdmin(me)) history = history.or(allowed?.length ? `sent_by.eq.${me.id},division_ids.ov.{${allowed.join(",")}}` : `sent_by.eq.${me.id}`);
  const { data: sent, error } = await history;
  // replies (migration 0045): every text people sent back, newest first, with the text each
  // probably answers (the latest sent to that number in the week before: texts don't say which);
  // each one only for the head staff of the division of whoever sent it, and up (lib/data/reply-access)
  const sees = replyVisibility(me, everybody);
  const [{ data: replied }, { data: recent }] = await Promise.all([
    sent?.length
      ? admin.from("text_replies").select("broadcast_id, profile_id, phone_e164").in("broadcast_id", sent.map((b) => b.id))
      : Promise.resolve({ data: [] as { broadcast_id: string | null; profile_id: string | null; phone_e164: string }[] }),
    admin
      .from("text_replies")
      .select("id, name, phone_e164, profile_id, body, received_at, broadcast_id")
      .order("received_at", { ascending: false })
      .limit(isAdmin(me) ? 60 : 400),
  ]);
  const divisionsOf = replyDivisions(everybody);
  const divisionName = new Map(tree.divisions.map((d) => [d.id, d.name]));
  // "Kinus Tzeirei Hashluchim - DH: Meeting at 9" → "Meeting at 9"
  const withoutPrefix = (body: string) => (body.startsWith(CAMP) ? body.replace(/^[^:]*:\s*/, "") : body);
  const shown = (recent ?? []).filter(sees).slice(0, 60);
  const answeredIds = [...new Set(shown.map((r) => r.broadcast_id).filter((x): x is string => Boolean(x)))];
  const { data: answered } = answeredIds.length ? await admin.from("text_broadcasts").select("id, body, sender_name").in("id", answeredIds) : { data: [] };
  const textById = new Map((answered ?? []).map((b) => [b.id, b]));
  const inbox: Reply[] = shown.map((r) => {
      const b = r.broadcast_id ? textById.get(r.broadcast_id) : undefined;
      return {
        id: r.id,
        name: r.name,
        phone_e164: r.phone_e164,
        body: r.body,
        received_at: r.received_at,
        where: divisionsOf(r).map((d) => divisionName.get(d)).filter(Boolean).join(", ") || undefined,
        answering: r.broadcast_id && b ? { id: r.broadcast_id, body: withoutPrefix(b.body), sender: b.sender_name } : null,
      };
    });
  const replyCount = new Map<string, number>();
  for (const r of replied ?? []) if (r.broadcast_id && sees(r)) replyCount.set(r.broadcast_id, (replyCount.get(r.broadcast_id) ?? 0) + 1);
  // the roles a text can be narrowed to, in their usual order
  const roleOptions = ROLE_ORDER.filter((r) => r !== "owner" && recipients.some((x) => x.role === r)).map((r) => ({ value: r, label: STAFF_ROLES[r].label }));
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
        <Compose camps={camps} recipients={recipients} roles={roleOptions} canEveryone={everyone} role={me.role} configured={!missing.length && !error && Boolean(twilioConfig())} />
      </Section>
      {inbox.length > 0 && (
        <Section
          title="Replies"
          description={`What staff texted back, newest first${isAdmin(me) ? "" : " (your divisions' staff)"}. Texts don't say which message they answer: it's the latest one that person got in the week before.`}
          bodyClassName="p-0"
        >
          <ReplyList replies={inbox} />
        </Section>
      )}
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
                      {replyCount.get(b.id) ? <span className="font-medium text-primary"> · {replyCount.get(b.id)} {replyCount.get(b.id) === 1 ? "reply" : "replies"}</span> : null}
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
