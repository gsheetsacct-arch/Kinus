"use client";
import * as React from "react";
import { toast } from "sonner";
import { Trash2, Type } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { removeFont, uploadFont } from "@/app/(app)/print/actions";

type Font = { id: string; name: string; family: string; files: { weight: number; italic: boolean }[] };

/** The designer's own fonts: upload once, pick in any template, printed exactly. */
export function FontsBox({ fonts }: { fonts: Font[] }) {
  const [pending, start] = React.useTransition();
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Type className="size-4 text-muted-foreground" /> Fonts
        </h2>
        <p className="text-sm text-muted-foreground">
          Add your own typefaces (TTF, OTF, WOFF or WOFF2): upload the regular file, then its bold or italic under the same name. They appear in the editor&apos;s font list and print
          exactly. Check that the font&apos;s licence allows embedding in printed documents.
        </p>
      </div>
      {fonts.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {fonts.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg leading-snug" style={{ fontFamily: `"${f.family}"` }} dir="auto">
                  {f.name} · Yossi Friedman · יוסף
                </span>
                <span className="block text-xs text-muted-foreground">
                  {f.files
                    .map((x) => `${x.weight === 700 ? "Bold" : "Regular"}${x.italic ? " italic" : ""}`)
                    .sort()
                    .join(", ")}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  confirm(`Remove ${f.name}? Text that uses it prints in the default font.`) &&
                  start(async () => {
                    const r = await removeFont(f.id);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  })
                }
                aria-label={`Remove ${f.name}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={uploadFont} resetOnSuccess className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Font name</span>
          <Input name="name" required maxLength={60} list="font-names" placeholder="e.g. Camp Display" className="w-48" />
          <datalist id="font-names">
            {fonts.map((f) => (
              <option key={f.id} value={f.name} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">This file is</span>
          <Select name="weight" defaultValue="400" className="w-28">
            <option value="400">Regular</option>
            <option value="700">Bold</option>
          </Select>
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="italic" className="size-4" /> Italic
        </label>
        <Input type="file" name="file" required accept=".ttf,.otf,.woff,.woff2" className="w-64" />
        <Button type="submit" variant="outline">
          Upload font
        </Button>
      </ActionForm>
    </section>
  );
}
