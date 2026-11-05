"use client";
import * as React from "react";
import { MessageSquare, Phone, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { STAFF_ROLES } from "@/lib/labels";
import { normalizeName } from "@/lib/import/normalize";
import { cn, formatPhone, telHref, whatsAppHref } from "@/lib/utils";
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
                      <a href={whatsAppHref(e.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex size-10 items-center justify-center rounded-full border hover:bg-muted sm:rounded-lg" aria-label={`WhatsApp ${e.name}`} title="WhatsApp">
                        <WhatsAppIcon className="size-4 text-[#25D366]" />
                      </a>
                    </>
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

/** The WhatsApp mark, for its button. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44a9.38 9.38 0 0 1 6.68 2.77 9.38 9.38 0 0 1 2.76 6.68c0 5.2-4.24 9.43-9.46 9.43m8.04-17.47A11.3 11.3 0 0 0 12.05.7C5.78.7.68 5.8.68 12.06c0 2 .52 3.96 1.52 5.68L.58 23.3l5.7-1.5a11.33 11.33 0 0 0 5.77 1.47h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.03-1.18-5.89-3.33-8.03" />
    </svg>
  );
}
