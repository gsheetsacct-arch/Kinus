"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applySupplement, previewSupplement, type SupplementPreview } from "@/app/(app)/admin/imports/supplement/actions";

/**
 * A file with extra details for some campers: their registration ID and a few columns. Shows
 * who it matches and what's in it; the chosen columns are added to those campers only.
 */
export function SupplementForm() {
  const [file, setFile] = React.useState<File | null>(null);
  const [idColumn, setIdColumn] = React.useState("");
  const [preview, setPreview] = React.useState<SupplementPreview | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const read = (f: File, id = "") =>
    start(async () => {
      const fd = new FormData();
      fd.set("file", f);
      if (id) fd.set("idColumn", id);
      const r = await previewSupplement(fd).catch(() => ({ ok: false as const, error: "Couldn't read the file. Check the connection and try again." }));
      if (!r.ok) {
        setPreview(null);
        return void toast.error(r.error);
      }
      setPreview(r);
      setIdColumn(r.idColumn ?? "");
    });

  if (done)
    return (
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-5 text-status-present" /> {done}
        </p>
        <p className="text-sm text-muted-foreground">The new columns show on the camper page, in lists and labels, and in Search. Rename them or choose who sees them in Settings.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => (setDone(null), setFile(null), setPreview(null))}>
            Add another file
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/admin/settings">Settings</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file || !preview) return;
        const fd = new FormData(e.currentTarget);
        fd.set("file", file);
        fd.set("idColumn", idColumn);
        start(async () => {
          const r = await applySupplement(fd).catch(() => ({ ok: false as const, error: "That didn't go through. Check the connection and try again." }));
          if (!r.ok) return void toast.error(r.error);
          setDone(r.message);
        });
      }}
    >
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-card px-4 py-8 text-center hover:bg-muted/30">
        <Upload className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">{file ? file.name : "Choose the file (Excel or CSV)"}</span>
        <span className="text-xs text-muted-foreground">A column with the registration ID (students.id), and the columns to add. Names aren&apos;t needed.</span>
        <input
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFile(f);
            read(f);
          }}
        />
      </label>

      {pending && !preview && <p className="text-sm text-muted-foreground">Reading the file…</p>}

      {preview && (
        <>
          <div className="space-y-2 rounded-xl border bg-card p-4">
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Registration ID column</span>
              <select value={idColumn} onChange={(e) => (setIdColumn(e.target.value), file && read(file, e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="" disabled>
                  Choose…
                </option>
                {preview.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            {idColumn ? (
              <p className="text-sm">
                <strong>{preview.matched}</strong> of {preview.rows} rows match a camper.
                {preview.unmatched.length > 0 && (
                  <span className="block text-muted-foreground">
                    No camper with: {preview.unmatched.slice(0, 15).join(", ")}
                    {preview.unmatched.length > 15 ? "…" : ""}
                  </span>
                )}
                {preview.noId > 0 && <span className="block text-muted-foreground">{preview.noId} rows have no ID.</span>}
              </p>
            ) : (
              <p className="text-sm text-destructive">Choose which column has the registration ID.</p>
            )}
          </div>

          <div className="space-y-2 rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">Columns to add</p>
            {preview.columns.map((c) => (
              <div key={c.column} className="grid items-center gap-2 border-t pt-2 sm:grid-cols-[auto_1fr_1fr]">
                <input type="checkbox" name="column" value={c.column} defaultChecked={c.filled > 0} className="size-4 accent-[var(--primary)]" aria-label={`Add ${c.column}`} />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{c.column}</span>
                  <span className="block truncate text-xs text-muted-foreground" dir="auto">
                    {c.filled ? `${c.filled} filled · ${c.samples.join(" · ")}` : "empty for the matched campers"}
                  </span>
                </span>
                <Input name={`label:${c.column}`} defaultValue={c.label} placeholder="Name in Kinus" className="h-8 text-sm" dir="auto" aria-label={`Name for ${c.column}`} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Empty cells change nothing. A camper who already has a value in a column gets this file&apos;s value instead.</p>
          </div>

          <Button type="submit" disabled={pending || !idColumn || !preview.matched}>
            {pending ? "Adding…" : `Add to ${preview.matched} ${preview.matched === 1 ? "camper" : "campers"}`}
          </Button>
        </>
      )}
    </form>
  );
}
