import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Callout } from "@/components/callout";
import { PrintPanel } from "@/components/print/print-panel";
import { requireUser } from "@/lib/auth/current-user";
import { visibleJobs } from "@/lib/print/access";
import { campStock, printSetSummary, sheetPositions } from "@/lib/print/jobs";
import { getCampContext } from "@/lib/data/camp";
import { plural } from "@/lib/utils";

export const metadata = { title: "Print together" };
export const maxDuration = 60;

/** Several requests for the same tag, printed as one: all at once, or one division at a time. */
export default async function PrintTogetherPage({ searchParams }: { searchParams: Promise<{ jobs?: string }> }) {
  const [, sp] = await Promise.all([requireUser(), searchParams]);
  const ids = [...new Set((sp.jobs ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 300);
  if (!ids.length) notFound();
  if (!(await visibleJobs(ids))) notFound();
  let summary: Awaited<ReturnType<typeof printSetSummary>>;
  try {
    summary = await printSetSummary(ids);
  } catch (e) {
    return (
      <div className="space-y-4">
        <PageHeader back={{ href: "/print", label: "Print queue" }} title="Print together" />
        <Callout tone="warning">{e instanceof Error ? e.message : "These requests can't be printed together."}</Callout>
      </div>
    );
  }
  const [positions, camp] = await Promise.all([sheetPositions(), getCampContext()]);
  const sheet = campStock(summary.stock, camp.current?.id, positions);
  const open = summary.statuses.some((s) => s !== "printed" && s !== "cancelled");
  const doubled = summary.askedMoreThanOnce;
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/print", label: "Print queue" }}
        title={`${summary.tags} × ${summary.templateName}`}
        description={`${plural(summary.requests, "request")} printed together, sorted by division and bunk.${doubled ? " A camper asked for more than once prints once." : ""}`}
      />
      <PrintPanel
        jobIds={ids}
        stock={sheet.stock}
      sheetLayout={summary.spec.sheet_layout ?? null}
      tagSize={{ w: summary.spec.page_width_mm, h: summary.spec.page_height_mm }}
        remembered={sheet.used}
        twoSided={summary.spec.back ?? null}
      parts={summary.parts}
        tags={summary.tags}
      campers={summary.campers}
        open={open}
        canSplit
      />
      <p className="text-xs text-muted-foreground">
        Want one on its own? Open it from the{" "}
        <Link href="/print" className="text-primary hover:underline">
          print queue
        </Link>
        .
      </p>
    </div>
  );
}
