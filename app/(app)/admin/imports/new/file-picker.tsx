"use client";
import { useState } from "react";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilePicker() {
  const [name, setName] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={() => setOver(true)}
      onDragLeave={() => setOver(false)}
      onDrop={() => setOver(false)}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
        over ? "border-primary bg-primary-soft/60" : name ? "border-primary/50 bg-primary-soft/30" : "border-input hover:border-primary/50 hover:bg-muted/40",
      )}
    >
      <input
        type="file"
        name="file"
        required
        accept=".csv,.tsv,.txt,.xlsx,.xls"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
      />
      {name ? <FileSpreadsheet className="size-9 text-primary" /> : <UploadCloud className="size-9 text-muted-foreground" />}
      <span className="font-medium" dir="auto">
        {name ?? "Choose the export file, or drop it here"}
      </span>
      <span className="text-xs text-muted-foreground">{name ? "Click to choose a different file" : ".csv or .xlsx, straight from the registration system"}</span>
    </label>
  );
}
