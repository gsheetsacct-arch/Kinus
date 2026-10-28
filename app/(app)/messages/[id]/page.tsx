import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth/current-user";
import { canTextStaff, isAdmin, textableDivisionIds } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime, formatPhone } from "@/lib/utils";

export const metadata = { title: "Text" };

const STATUS: Record<string, { label: string; variant: "success" | "info" | "warning" | "destructive" | "secondary" }> = {
  queued: { label: "Sending", variant: "secondary" },
  accepted: { label: "Sending", variant: "secondary" },
  sending: { label: "Sending", variant: "secondary" },
  sent: { label: "Sent", variant: "info" },
  delivered: { label: "Delivered", variant: "success" },
  undelivered: { label: "Not delivered", variant: "warning" },
  failed: { label: "Failed", variant: "destructive" },
};

/** One text: what it said, who sent it, and how it went for each person. */
export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (!canTextStaff(me)) redirect("/?denied=head-staff");
  const { id } = await params;
  const admin = createAdminClient();
  const { data: b } = await admin.from("text_broadcasts").select("id, sent_by, sender_name, body, audience, division_ids, recipient_count, created_at").eq("id", id).maybeSingle();
  if (!b) notFound();
  const allowed = textableDivisionIds(me);
  const mine = isAdmin(me) || b.sent_by === me.id || (b.division_ids.length > 0 && (!allowed || b.division_ids.some((d) => allowed.includes(d))));
  if (!mine) notFound();
  const { data: rows } = await admin.from("text_broadcast_recipients").select("id, name, phone_e164, status, error_code, error_message").eq("broadcast_id", id).order("name");
  const list = rows ?? [];
  const counts = list.reduce<Record<string, number>>((n, r) => ({ ...n, [STATUS[r.status]?.label ?? r.status]: (n[STATUS[r.status]?.label ?? r.status] ?? 0) + 1 }), {});
  const stillSending = list.some((r) => ["queued", "accepted", "sending"].includes(r.status));
  return (
    <div className="space-y-6">
      {stillSending && <AutoRefresh every={10_000} />}
      <PageHeader
        title={`To ${b.audience}`}
        back={{ href: "/messages", label: "Text staff" }}
        description={`${formatDateTime(b.created_at)} · from ${b.sender_name} · ${b.recipient_count} ${b.recipient_count === 1 ? "person" : "people"}`}
      />
      <Section>
        <p className="whitespace-pre-wrap" dir="auto">
          {b.body}
        </p>
      </Section>
      <Section
        title="Delivery"
        description={Object.entries(counts)
          .map(([k, v]) => `${v} ${k.toLowerCase()}`)
          .join(" · ")}
        bodyClassName="p-0"
      >
        <ul className="divide-y">
          {list.map((r) => {
            const s = STATUS[r.status] ?? { label: r.status, variant: "secondary" as const };
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium" dir="auto">
                    {r.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatPhone(r.phone_e164)}
                    {r.error_message && ` · ${r.error_message}`}
                    {r.error_code && ` (${r.error_code})`}
                  </span>
                </span>
                <Badge variant={s.variant}>{s.label}</Badge>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
