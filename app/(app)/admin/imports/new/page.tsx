import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Steps, IMPORT_STEPS } from "@/components/steps";
import { EmptyState } from "@/components/empty-state";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { getActiveSession, requireAdmin } from "@/lib/auth/current-user";
import { uploadImport } from "../actions";
import { FilePicker } from "./file-picker";

export const metadata = { title: "Upload export" };

export default async function NewImportPage() {
  await requireAdmin();
  const session = await getActiveSession();
  if (!session) {
    return <EmptyState icon={UploadCloud} title="No active session" description="Create or activate a session first." action={<Button asChild><Link href="/admin/sessions">Sessions</Link></Button>} />;
  }
  return (
    <div className="max-w-2xl">
      <PageHeader back={{ href: "/admin/imports", label: "Import roster" }} title="Upload the export" description={`Into ${session.name}`} />
      <Steps steps={IMPORT_STEPS} current={1} />
      <Section>
        <ActionForm action={uploadImport} className="space-y-5">
          <FilePicker />
          <Button type="submit" size="lg">
            Upload and continue
          </Button>
        </ActionForm>
      </Section>
    </div>
  );
}
