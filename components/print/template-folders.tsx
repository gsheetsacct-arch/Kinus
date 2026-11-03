"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderInput, Pencil } from "lucide-react";
import { organizeTemplatesAction } from "@/app/(app)/print/actions";
import type { FolderOps } from "@/lib/print/folders";

const NEW = "__new";

function useOrganize() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = (ops: FolderOps) =>
    start(async () => {
      const r = await organizeTemplatesAction(ops).catch(() => ({ ok: false as const, error: "That didn't go through. Check the connection and try again." }));
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  return { run, pending };
}

/** "Move to…" on a template card: another folder, out of its folder, or a new one. */
export function MoveToFolder({ templateId, folder, folders }: { templateId: string; folder: string | null; folders: string[] }) {
  const { run, pending } = useOrganize();
  return (
    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Move to a folder">
      <FolderInput className="size-3.5" />
      <select
        className="max-w-36 rounded-md border bg-background px-1.5 py-1 text-xs disabled:opacity-50"
        value={folder ?? ""}
        disabled={pending}
        aria-label="Folder"
        onChange={(e) => {
          let to: string | null = e.target.value;
          if (to === NEW) {
            to = window.prompt("New folder's name")?.trim() || null;
            if (!to) return;
          }
          run({ moves: [{ template_id: templateId, folder: to || null }] });
        }}
      >
        <option value="">No folder</option>
        {folders.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
        <option value={NEW}>New folder…</option>
      </select>
    </label>
  );
}

/** Rename a folder (its templates move along); an empty name takes them out of it. */
export function RenameFolder({ folder }: { folder: string }) {
  const { run, pending } = useOrganize();
  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={(e) => {
        e.preventDefault();
        const to = window.prompt(`Rename “${folder}” (leave empty to take its templates out of the folder)`, folder);
        if (to === null || to.trim() === folder) return;
        run({ renames: [{ from: folder, to: to.trim() || null }] });
      }}
    >
      <Pencil className="size-3" /> Rename
    </button>
  );
}
