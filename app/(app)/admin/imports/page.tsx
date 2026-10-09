import Link from "next/link";
import { FileSpreadsheet, Upload, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Callout } from "@/components/callout";
import { EmptyState } from "@/components/empty-state";
import { UndoImportButton } from "@/components/undo-import-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { IMPORT_STATUS } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Import roster" };

export default async function ImportsPage() {
  await requireAdmin();
  const session = await getActiveSession();
  if (!session) {
    return (
      <div className="space-y-6">
        <PageHeader title="Import roster" />
        <EmptyState icon={Upload} title="No active session" description="Imports go into a session. Create or activate one first." action={<Button asChild><Link href="/admin/sessions">Sessions</Link></Button>} />
      </div>
    );
  }
  const supabase = await createClient();
  const { data: imports } = await supabase
    .from("imports")
    .select("id, file_name, status, uploaded_at, applied_at, summary, profiles:uploaded_by(full_name)")
    .eq("session_id", session.id)
    .order("uploaded_at", { ascending: false })
    .limit(50);
  const latestApplied = (imports ?? []).filter((i) => i.status === "applied").sort((a, b) => (b.applied_at ?? "").localeCompare(a.applied_at ?? ""))[0];
  const drafts = (imports ?? []).filter((i) => i.status === "uploaded" || i.status === "previewed");
  const history = (imports ?? []).filter((i) => !drafts.includes(i) && i.status !== "cancelled");

  const newButton = (
    <Button asChild>
      <Link href="/admin/imports/new">
        <Upload /> Upload a new export
      </Link>
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Import roster" description={`Into ${session.name}`} actions={imports?.length ? newButton : undefined} />
      <Callout title="How importing works">
        Upload the registration export whenever it changes. Kinus shows you exactly who will be added and what will change, and <strong>nothing is saved until you press Apply</strong>. If something looks
        wrong afterwards, you can undo the latest import.
      </Callout>

      {drafts.map((d) => (
        <Callout
          key={d.id}
          tone="warning"
          title="You have an unfinished import"
          action={
            <Button asChild size="sm">
              <Link href={d.status === "uploaded" ? `/admin/imports/${d.id}/map` : `/admin/imports/${d.id}`}>Continue</Link>
            </Button>
          }
        >
          <span dir="auto">{d.file_name}</span>, uploaded {formatDateTime(d.uploaded_at)}. It hasn&apos;t changed anything yet.
        </Callout>
      ))}

      {!history.length && !drafts.length ? (
        <EmptyState icon={FileSpreadsheet} title="No imports yet" description="Download the export from the registration system and upload it here, as it is. Don't open and save it first." action={newButton} />
      ) : (
        history.length > 0 && (
          <Section title="History" bodyClassName="p-0">
            <ul className="divide-y">
              {history.map((i) => {
                const s = (i.summary ?? {}) as Record<string, number>;
                const st = IMPORT_STATUS[i.status];
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <Link href={`/admin/imports/${i.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <FileSpreadsheet className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium" dir="auto">
                            {i.file_name}
                          </span>
                          <Badge variant={st.variant}>{st.label}</Badge>
                          {latestApplied?.id === i.id && <Badge variant="outline">Latest</Badge>}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDateTime(i.applied_at ?? i.uploaded_at)} · {(i.profiles as { full_name: string } | null)?.full_name ?? ""}
                          {i.status === "applied" && ` · ${s.added ?? 0} added, ${s.updated ?? 0} changed`}
                        </span>
                      </span>
                    </Link>
                    {latestApplied?.id === i.id ? <UndoImportButton id={i.id} fileName={i.file_name} size="sm" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  </li>
                );
              })}
            </ul>
          </Section>
        )
      )}
    </div>
  );
}
