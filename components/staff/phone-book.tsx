"use client";
import * as React from "react";
import { Mail, MessageSquare, Phone, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { STAFF_ROLES } from "@/lib/labels";
import { normalizeName } from "@/lib/import/normalize";
import { formatPhone, telHref } from "@/lib/utils";
import type { PhoneBookSection } from "@/lib/data/phone-book";

/** Staff by division (head staff, then counselors by bunk), searchable, one tap to call or text. */
export function PhoneBook({ sections }: { sections: PhoneBookSection[] }) {
  const [q, setQ] = React.useState("");
  const needle = normalizeName(q);
  const shown = sections
    .map((s) => ({
      ...s,
      entries: s.entries.filter((e) => !needle || normalizeName(`${e.name} ${e.where} ${STAFF_ROLES[e.role].label}`).includes(needle) || (e.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "x")),
    }))
    .filter((s) => s.entries.length);
  const missing = sections.flatMap((s) => s.entries).filter((e) => !e.phone).length;
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, bunk or role" className="pl-9 pr-9" dir="auto" aria-label="Find a staff member" />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground hover:bg-muted" aria-label="Clear">
            <X className="size-4" />
          </button>
        )}
      </div>
      {shown.map((s) => (
        <section key={s.key} className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-card)]">
          <header className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
            {s.color && <span className="size-2.5 rounded-full" style={{ background: s.color }} />}
            <h2 className="font-semibold" dir="auto">
              {s.title}
            </h2>
            <span className="text-sm text-muted-foreground">({s.entries.length})</span>
          </header>
          <ul className="divide-y">
            {s.entries.map((e) => (
              <li key={`${s.key}-${e.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block font-medium" dir="auto">
                    {e.name}
                    {e.you && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground" dir="auto">
                    {STAFF_ROLES[e.role].label} · {e.where}
                    {e.phone ? ` · ${formatPhone(e.phone)}` : " · no phone yet"}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  {e.phone && (
                    <>
                      <a href={telHref(e.phone)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted" aria-label={`Call ${e.name}`}>
                        <Phone className="size-4 text-primary" /> Call
                      </a>
                      <a href={`sms:${e.phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-10 items-center rounded-lg border px-3 hover:bg-muted" aria-label={`Text ${e.name}`} title="Text">
                        <MessageSquare className="size-4 text-primary" />
                      </a>
                    </>
                  )}
                  {e.email && (
                    <a href={`mailto:${e.email}`} className="inline-flex h-10 items-center rounded-lg border px-3 hover:bg-muted" aria-label={`Email ${e.name}`} title={e.email}>
                      <Mail className="size-4 text-primary" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!shown.length && <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{q ? `Nobody matches “${q}”.` : "No staff in your divisions yet."}</p>}
      {missing > 0 && !q && (
        <p className="px-1 text-xs text-muted-foreground">
          {missing} {missing === 1 ? "person has" : "people have"} no phone number yet. Everyone can add their own on their Account page; directors can add it on the Staff page.
        </p>
      )}
    </div>
  );
}
