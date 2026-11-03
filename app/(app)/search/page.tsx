import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getActiveSession, requireUser } from "@/lib/auth/current-user";
import { getCampContext } from "@/lib/data/camp";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLE_LABEL, actionWord, thingName } from "@/lib/audit/describe";
import { SEARCH_PARTS, partsFor, searchActivity, searchCampers, searchImports, searchPlaces, searchPrint, searchStaff, searchTemplates, searchTexts, type SearchHit, type SearchPart } from "@/lib/data/search";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * One box for all of Kinus, or one part of it (pills): campers (names, codes, phones, and
 * anything in their export columns), staff, the activity log, print requests, templates,
 * divisions and bunks, texts and imports. Each part shows only what this person may see.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; in?: string }> }) {
  const [user, session, camp, sp] = await Promise.all([requireUser(), getActiveSession(), getCampContext(), searchParams]);
  if (!session) return <EmptyState icon={SearchIcon} title="No active session" description="Camp hasn't been set up yet." />;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const parts = partsFor(user);
  const part = parts.includes(sp.in as SearchPart) ? (sp.in as SearchPart) : null;
  const want = (p: SearchPart) => parts.includes(p) && (!part || part === p);
  const href = (o: { in?: string | null }) => `/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(o.in ? { in: o.in } : {}) })}`;

  type Result = { part: SearchPart; hits: SearchHit[] };
  const results: Result[] = [];
  let activity: Awaited<ReturnType<typeof searchActivity>> = [];
  if (q.length >= 2) {
    const run = async (p: SearchPart, fn: () => Promise<SearchHit[]>) => (want(p) ? { part: p, hits: await fn().catch((e) => (console.error(`Search ${p} failed`, e), [] as SearchHit[])) } : null);
    const found = await Promise.all([
      run("campers", () => searchCampers(user, session.id, q, camp.divisionIds, part ? 200 : 60)),
      run("staff", () => searchStaff(user, session.id, q, camp.divisionIds)),
      run("print", () => searchPrint(user, session.id, q)),
      run("templates", () => searchTemplates(user, q)),
      run("places", () => searchPlaces(session.id, q, camp.divisionIds)),
      run("texts", () => searchTexts(user, q)),
      run("imports", () => searchImports(user, q)),
      want("activity") ? searchActivity(user, q, null, part ? 100 : 15).then((a) => ((activity = a), null)).catch((e) => (console.error("Search activity failed", e), null)) : null,
    ]);
    for (const r of found) if (r && r.hits.length) results.push(r);
  }
  // the activity log, in words
  const actorIds = [...new Set(activity.map((a) => a.actor_id).filter((x): x is string => Boolean(x)))];
  const { data: actors } = actorIds.length ? await createAdminClient().from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name]));
  const total = results.reduce((n, r) => n + r.hits.length, 0) + activity.length;
  const shown = part ? 500 : 8;

  return (
    <div className="space-y-4">
      <PageHeader title="Search" description="Everything in Kinus you can see: campers (and anything in their registration), staff, print requests, templates, divisions and bunks, texts, and for directors the activity log." />
      <form action="/search" className="flex gap-2">
        {part && <input type="hidden" name="in" value={part} />}
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="A name, code, phone, a word from a form…" className="h-11 pl-9 text-base" dir="auto" autoFocus={!q} aria-label="Search" />
        </div>
        <Button type="submit" className="h-11">
          Search
        </Button>
      </form>
      {/* where to look, as pills that scroll sideways */}
      <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Search in">
        {[null, ...parts].map((p) => (
          <Link
            key={p ?? "all"}
            href={href({ in: p })}
            aria-current={part === p ? "page" : undefined}
            className={cn("inline-flex h-8 shrink-0 items-center rounded-full border bg-card px-3 text-sm whitespace-nowrap hover:border-primary/40", part === p && "border-primary bg-primary text-primary-foreground")}
          >
            {p ? SEARCH_PARTS[p] : "Everything"}
          </Link>
        ))}
      </nav>

      {q.length < 2 ? (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Type at least two letters or digits.</p>
      ) : total === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing {part ? `in ${SEARCH_PARTS[part].toLowerCase()} ` : ""}matches “{q}”.
        </p>
      ) : (
        <div className="space-y-4">
          {results.map((r) => (
            <section key={r.part} className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
              <header className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
                <h2 className="font-semibold">{SEARCH_PARTS[r.part]}</h2>
                <span className="text-sm text-muted-foreground">({r.hits.length})</span>
                {!part && r.hits.length > shown && (
                  <Link href={href({ in: r.part })} className="ml-auto text-sm text-primary hover:underline">
                    See all
                  </Link>
                )}
              </header>
              <ul className="divide-y">
                {r.hits.slice(0, shown).map((h, i) => (
                  <li key={`${h.href}-${i}`}>
                    <Link href={h.href} prefetch={false} className="block px-4 py-2.5 hover:bg-muted/50">
                      <span className="block truncate font-medium" dir="auto">
                        {h.title}
                      </span>
                      {(h.detail || h.matched || h.at) && (
                        <span className="block truncate text-xs text-muted-foreground" dir="auto">
                          {[h.matched, h.detail, h.at ? formatDateTime(h.at) : null].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {activity.length > 0 && (
            <section className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
              <header className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
                <h2 className="font-semibold">Activity log</h2>
                <span className="text-sm text-muted-foreground">({activity.length}{activity.length >= (part ? 100 : 15) ? "+" : ""})</span>
                <Link href={`/admin/activity?q=${encodeURIComponent(q)}`} className="ml-auto text-sm text-primary hover:underline">
                  Open in Activity
                </Link>
              </header>
              <ul className="divide-y">
                {activity.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <span dir="auto">
                      <span className="font-medium">{a.actor_id ? (actorName.get(a.actor_id) ?? "Someone") : a.source.startsWith("import:") ? "An import" : "Kinus"}</span> {actionWord(a.table_name, a.action)}{" "}
                      {a.table_name !== "app" && <span className="text-muted-foreground">{(TABLE_LABEL[a.table_name] ?? a.table_name).toLowerCase()} </span>}
                      <span className="font-medium">{thingName(a) ?? ""}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(a.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
