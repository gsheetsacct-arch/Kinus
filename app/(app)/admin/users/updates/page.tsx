import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CopyLink, RemoveSignup } from "@/components/staff/signup-list";
import { requireDirector } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/auth/app-url";
import { qrSvg } from "@/lib/print/barcode";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Updates sign-ups" };

/** Staff who signed up for text updates on the public page (/updates), and the link to share. */
export default async function SignupsPage() {
  await requireDirector();
  const link = `${await appUrl()}/updates`;
  const { data, error } = await createAdminClient().from("update_signups").select("id, full_name, phone_e164, consented_at").order("consented_at", { ascending: false });
  const rows = data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Updates sign-ups"
        description={error ? "Waiting for the database update (migration 0038)." : `${rows.length} ${rows.length === 1 ? "person" : "people"} signed up for text updates from the directors`}
        actions={
          rows.length > 0 && (
            <>
              <Button asChild variant="outline">
                <Link href="/admin/users/updates/export?format=xlsx" prefetch={false}>
                  <FileSpreadsheet /> Excel
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/users/updates/export" prefetch={false}>
                  CSV
                </Link>
              </Button>
            </>
          )
        }
      />
      <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="space-y-2">
          <p className="font-medium">The sign-up page</p>
          <p className="text-sm text-muted-foreground">
            Send this link to staff, or put the QR code up in the staff room. Anyone can open it, without an account: name, cell number, and a tick to agree to texts from the
            directors (what they agreed to is kept with each sign-up). Signing up again with the same number updates the name.
          </p>
          <CopyLink url={link} />
        </div>
        <div className="mx-auto size-36 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg(link) }} />
      </section>
      {rows.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.full_name}</span>
                <span className="block text-sm text-muted-foreground">
                  <a href={`tel:${r.phone_e164}`} className="hover:underline">
                    {r.phone_e164}
                  </a>{" "}
                  · agreed {formatDateTime(r.consented_at)}
                </span>
              </span>
              <RemoveSignup id={r.id} name={r.full_name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
