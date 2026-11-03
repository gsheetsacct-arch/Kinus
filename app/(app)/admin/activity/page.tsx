import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requireUser, getActiveSession } from "@/lib/auth/current-user";
import { isDirector } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { campDateTimeToIso } from "@/lib/time";
import { formatDateTime } from "@/lib/utils";
import { searchActivity } from "@/lib/data/search";
import { CATEGORIES, TABLE_LABEL, actionWord, changesOf, showValue, thingName } from "@/lib/audit/describe";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const PAGE = 60;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Everything done in Kinus, newest first: every change to campers, staff, settings,
 * templates…, who made it, from which page, and exactly what changed (old → new); and
 * sign-ins, downloads and prints. Owners and directors only.
 */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ who?: string; cat?: string; day?: string; camper?: string; before?: string; q?: string }> }) {
  const [user, session, sp] = await Promise.all([requireUser(), getActiveSession(), searchParams]);
  if (!isDirector(user)) notFound();
  const admin = createAdminClient();
  const cat = sp.cat && sp.cat in CATEGORIES ? sp.cat : "";
  const day = sp.day && DAY.test(sp.day) ? sp.day : "";
  const camperText = (sp.camper ?? "").trim().slice(0, 60);

  // a camper by name: their own record's changes and their contacts'
  let camperIds: string[] | null = null;
  if (camperText && session) {
    const words = camperText.split(/\s+/).filter(Boolean).slice(0, 3);
    let q = admin.from("campers").select("id").eq("session_id", session.id).limit(40);
    for (const w of words) q = q.or(`first_name.ilike.%${w.replace(/[%,()]/g, "")}%,last_name.ilike.%${w.replace(/[%,()]/g, "")}%`);
    camperIds = ((await q).data ?? []).map((c) => c.id);
  }

  let q = admin.from("audit_log").select("id, at, actor_id, source, table_name, row_id, row_key, action, before, after, diff, via").order("id", { ascending: false }).limit(PAGE + 1);
  if (sp.who === "none") q = q.is("actor_id", null);
  else if (sp.who && /^[0-9a-f-]{36}$/i.test(sp.who)) q = q.eq("actor_id", sp.who);
  if (cat) q = q.in("table_name", CATEGORIES[cat].tables);
  if (day) {
    const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86400_000).toISOString().slice(0, 10);
    q = q.gte("at", campDateTimeToIso(day, "00:00")).lt("at", campDateTimeToIso(next, "00:00"));
  }
  if (camperIds) {
    const ids = camperIds.length ? camperIds.join(",") : "00000000-0000-0000-0000-000000000000";
    q = q.in("table_name", ["campers", "camper_contacts", "camper_followups", "buzzer_assignments"]).or(`row_id.in.(${ids}),after->>camper_id.in.(${ids}),before->>camper_id.in.(${ids})`);
  }
  if (sp.before && /^\d+$/.test(sp.before)) q = q.lt("id", Number(sp.before));
  // words to find anywhere in what was recorded (from Search): the log searched as a whole
  const text = (sp.q ?? "").trim().slice(0, 100);
  const found = text.length >= 2 ? await searchActivity(user, text, sp.before && /^\d+$/.test(sp.before) ? Number(sp.before) : null, PAGE + 1).then((data) => ({ data, error: null })) : null;
  const [{ data: rows, error }, { data: staff }] = await Promise.all([found ?? q, admin.from("profiles").select("id, full_name").order("full_name")]);
  const list = (rows ?? []).slice(0, PAGE);
  const more = (rows ?? []).length > PAGE;
  const nameOf = new Map((staff ?? []).map((p) => [p.id, p.full_name]));
  // contacts, follow-ups and buzzers say whose they are
  const camperOf = new Set(list.map((r) => ((r.after ?? r.before) as { camper_id?: string } | null)?.camper_id).filter((x): x is string => Boolean(x)));
  const { data: campers } = camperOf.size ? await admin.from("campers").select("id, first_name, last_name").in("id", [...camperOf]) : { data: [] };
  const camperName = new Map((campers ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]));

  const who = (r: (typeof list)[number]) =>
    r.actor_id ? (nameOf.get(r.actor_id) ?? "Someone no longer on staff") : r.source.startsWith("import:") ? "An import" : r.source.startsWith("revert:") ? "Undoing an import" : "Kinus (automatic)";
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ who: sp.who, cat, day, camper: camperText, q: sp.q, ...o })) if (v) p.set(k, v);
    return `/admin/activity?${p}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Activity" description="Everything done in Kinus, newest first: who did it, from where, and exactly what changed. Only owners and directors see this." />
      <form className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_1fr_auto_1fr_auto]" action="/admin/activity">
        <Select name="who" defaultValue={sp.who ?? ""} aria-label="Who">
          <option value="">Everyone</option>
          <option value="none">Kinus itself and imports</option>
          {(staff ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </Select>
        <Select name="cat" defaultValue={cat} aria-label="What">
          <option value="">Everything</option>
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input type="date" name="day" defaultValue={day} aria-label="Day" />
        <Input name="camper" defaultValue={camperText} placeholder="A camper's name" aria-label="Camper" dir="auto" />
        {sp.q && <input type="hidden" name="q" value={sp.q} />}
        <Button type="submit">Show</Button>
      </form>
      {text.length >= 2 && (
        <p className="text-sm text-muted-foreground">
          Everything that mentions “{text}” (the filters above don&apos;t apply).{" "}
          <Link href="/admin/activity" className="text-primary hover:underline">
            Show everything
          </Link>
        </p>
      )}
      {error && <p className="text-sm text-destructive">Couldn&apos;t load the log: {error.message}</p>}
      {!list.length ? (
        <p className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">Nothing here{sp.before ? " further back" : ""}.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
          {list.map((r) => {
            const changes = changesOf(r);
            const owner = ((r.after ?? r.before) as { camper_id?: string } | null)?.camper_id;
            const name = thingName(r);
            const camperLink = r.table_name === "campers" ? r.row_id : (owner ?? null);
            return (
              <li key={r.id} className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{who(r)}</span>
                  <span>{actionWord(r.table_name, r.action)}</span>
                  {r.table_name !== "app" && <span className="text-muted-foreground">{(TABLE_LABEL[r.table_name] ?? r.table_name).toLowerCase()}</span>}
                  {name && (
                    <span dir="auto" className="font-medium">
                      {camperLink && r.table_name === "campers" ? <Link href={`/campers/${camperLink}`} className="hover:underline">{name}</Link> : name}
                    </span>
                  )}
                  {owner && r.table_name !== "campers" && (
                    <span className="text-muted-foreground">
                      of{" "}
                      <Link href={`/campers/${owner}`} dir="auto" className="hover:underline">
                        {camperName.get(owner) ?? "a camper"}
                      </Link>
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDateTime(r.at)}
                    {r.via ? ` · ${safeDecode(r.via)}` : ""}
                  </span>
                </div>
                {changes.length > 0 && (
                  <dl className="grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[minmax(8rem,auto)_1fr]">
                    {changes.slice(0, 12).map((c) => (
                      <div key={c.field} className="contents">
                        <dt className="text-muted-foreground">{c.label}</dt>
                        <dd dir="auto" className="min-w-0 break-words">
                          {"old" in c && <span className="text-destructive line-through decoration-destructive/40">{showValue(c.old)}</span>}
                          {"old" in c && "new" in c && <span className="text-muted-foreground"> → </span>}
                          {"new" in c && <span>{showValue(c.new)}</span>}
                        </dd>
                      </div>
                    ))}
                    {changes.length > 12 && <dd className="text-muted-foreground sm:col-start-2">and {changes.length - 12} more (below)</dd>}
                  </dl>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Everything recorded</summary>
                  <pre dir="auto" className="mt-1 max-h-80 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap break-all">
                    {JSON.stringify({ source: r.source, row: r.row_id ?? r.row_key, ...(r.action === "UPDATE" ? { changes: r.diff } : { [r.action === "DELETE" ? "removed" : "added"]: r.action === "DELETE" ? r.before : r.after }) }, null, 2)}
                  </pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-between">
        {sp.before ? (
          <Button variant="outline" asChild>
            <Link href={href({ before: undefined })}>Newest</Link>
          </Button>
        ) : (
          <span />
        )}
        {more && (
          <Button variant="outline" asChild>
            <Link href={href({ before: String(list[list.length - 1].id) })}>Older</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
