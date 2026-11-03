"use client";
import * as React from "react";
import { Mail, MessageSquare, Phone, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { STAFF_ROLES } from "@/lib/labels";
import { normalizeName } from "@/lib/import/normalize";
import { cn, formatPhone, telHref } from "@/lib/utils";
import type { PhoneBookSection } from "@/lib/data/phone-book";

/** Staff by division (head staff, then counselors by bunk), searchable, one tap to call or text. */
export function PhoneBook({ sections }: { sections: PhoneBookSection[] }) {
  const [q, setQ] = React.useState("");
  // one division (section) and one role at a time, picked from pills that scroll sideways
  const [part, setPart] = React.useState("");
  const [role, setRole] = React.useState("");
  const needle = normalizeName(q);
  const digits = q.replace(/\D/g, "");
  const matchesQ = (e: PhoneBookSection["entries"][number]) =>
    !needle || normalizeName(`${e.name} ${e.where} ${STAFF_ROLES[e.role].label} ${e.title ?? ""}`).includes(needle) || (digits.length >= 3 && (e.phone ?? "").replace(/\D/g, "").includes(digits));
  const inPart = sections.filter((s) => !part || s.key === part);
  const roleCount = new Map<string, number>();
  for (const s of inPart) for (const e of s.entries) if (matchesQ(e)) roleCount.set(e.role, (roleCount.get(e.role) ?? 0) + 1);
  const shown = inPart.map((s) => ({ ...s, entries: s.entries.filter((e) => matchesQ(e) && (!role || e.role === role)) })).filter((s) => s.entries.length);
  const missing = sections.flatMap((s) => s.entries).filter((e) => !e.phone).length;
  const roleOrder = Object.keys(STAFF_ROLES);
  return (
    <div className="space-y-3">
      {/* stays at the top while scrolling the list */}
      <div className="sticky top-[61px] z-10 -mx-4 space-y-2 bg-background/95 px-4 pb-2 pt-1 backdrop-blur md:top-0 md:-mx-8 md:px-8">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, bunk, role or phone" className="h-10 pl-9 pr-9" dir="auto" aria-label="Find a staff member" />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:bg-muted" aria-label="Clear">
              <X className="size-4" />
            </button>
          )}
        </div>
        {sections.length > 1 && (
          <Pills label="Division">
            <Pill on={!part} onClick={() => setPart("")}>
              Everyone
            </Pill>
            {sections.map((s) => (
              <Pill key={s.key} on={part === s.key} onClick={() => setPart(part === s.key ? "" : s.key)} count={s.entries.filter(matchesQ).length} color={s.color}>
                {s.title}
              </Pill>
            ))}
          </Pills>
        )}
        {roleCount.size > 1 && (
          <Pills label="Role">
            <Pill on={!role} onClick={() => setRole("")}>
              All roles
            </Pill>
            {[...roleCount.entries()]
              .sort((a, b) => roleOrder.indexOf(a[0]) - roleOrder.indexOf(b[0]))
              .map(([r, n]) => (
                <Pill key={r} on={role === r} onClick={() => setRole(role === r ? "" : r)} count={n}>
                  {STAFF_ROLES[r as keyof typeof STAFF_ROLES].label}
                </Pill>
              ))}
          </Pills>
        )}
      </div>
      {shown.map((s) => (
        <section key={s.key} className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
          <header className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
            {s.color && <span className="size-2.5 rounded-full" style={{ background: s.color }} />}
            <h2 className="font-semibold" dir="auto">
              {s.title}
            </h2>
            <span className="text-sm text-muted-foreground">({s.entries.length})</span>
          </header>
          <ul className="divide-y">
            {s.entries.map((e) => (
              <li key={`${s.key}-${e.id}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" dir="auto">
                    {e.name}
                    {e.you && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground" dir="auto">
                    {e.title || STAFF_ROLES[e.role].label} · {e.where}
                    {e.phone ? ` · ${formatPhone(e.phone)}` : " · no phone yet"}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  {e.phone && (
                    <>
                      <a href={telHref(e.phone)} className="inline-flex size-10 items-center justify-center rounded-full border hover:bg-muted sm:w-auto sm:gap-1.5 sm:rounded-lg sm:px-3 sm:text-sm sm:font-medium" aria-label={`Call ${e.name}`} title="Call">
                        <Phone className="size-4 text-primary" /> <span className="hidden sm:inline">Call</span>
                      </a>
                      <a href={`sms:${e.phone.replace(/[^\d+]/g, "")}`} className="inline-flex size-10 items-center justify-center rounded-full border hover:bg-muted sm:rounded-lg" aria-label={`Text ${e.name}`} title="Text">
                        <MessageSquare className="size-4 text-primary" />
                      </a>
                    </>
                  )}
                  {e.email && (
                    <a href={`mailto:${e.email}`} className="inline-flex size-10 items-center justify-center rounded-full border hover:bg-muted sm:rounded-lg" aria-label={`Email ${e.name}`} title={e.email}>
                      <Mail className="size-4 text-primary" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!shown.length && <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{q || part || role ? "Nobody matches." : "No staff in your divisions yet."}</p>}
      {missing > 0 && !q && (
        <p className="px-1 text-xs text-muted-foreground">
          {missing} {missing === 1 ? "person has" : "people have"} no phone number yet. Everyone can add their own on their Account page; directors can add it on the Staff page.
        </p>
      )}
    </div>
  );
}

/** A row of pills that scrolls sideways (no wrapping onto more lines). */
function Pills({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function Pill({ on, onClick, count, color, children }: { on: boolean; onClick: () => void; count?: number; color?: string | null; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-sm whitespace-nowrap transition-colors hover:border-primary/40", on && "border-primary bg-primary text-primary-foreground hover:border-primary")}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      <span dir="auto">{children}</span>
      {count !== undefined && <span className={cn("font-semibold tabular-nums", !on && "text-muted-foreground")}>{count}</span>}
    </button>
  );
}
