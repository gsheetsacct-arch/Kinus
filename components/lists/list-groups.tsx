"use client";
import { telHref } from "@/lib/utils";
import Link from "next/link";
import type { BuiltList } from "@/lib/data/lists";

/**
 * A printed list: one table per group. Kept deliberately plain (styles on the table, not
 * on each cell) because a whole camp is ~1,000 rows.
 */
export function ListGroups({ columns, groups }: Pick<BuiltList, "columns" | "groups">) {
  const nameCol = columns.findIndex((c) => c.key === "display_name");
  const phoneCols = new Set(columns.flatMap((c, i) => (c.key.endsWith(".phone") ? [i] : [])));
  return (
    <>
      {groups.map((g, gi) => (
        <section key={g.title || "all"} className={`rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] print:border-0 print:p-0 print:shadow-none ${gi > 0 ? "print-page-break mt-6" : ""}`}>
          {g.title && (
            <h2 className="mb-2 text-lg font-semibold" dir="auto">
              {g.title} <span className="text-sm font-normal text-muted-foreground">({g.rows.length})</span>
            </h2>
          )}
          {gi === 0 && columns.length > 3 && <p className="no-print mb-1 text-xs text-muted-foreground sm:hidden">Swipe the table sideways to see every column →</p>}
          <div className="-mx-4 overflow-x-auto px-4 print:mx-0 print:overflow-visible print:px-0">
            <table className="list-table w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-6">#</th>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    {r.cells.map((v, ci) =>
                      ci === nameCol ? (
                        <td key={ci}>
                          <Link href={`/campers/${r.id}`} prefetch={false}>
                            {String(v ?? "")}
                          </Link>
                        </td>
                      ) : phoneCols.has(ci) && v ? (
                        <td key={ci}>
                          <a href={telHref(String(v))} className="-my-2 inline-block py-2">{String(v)}</a>
                        </td>
                      ) : (
                        <td key={ci}>{typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? "")}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
