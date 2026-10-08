"use client";
import * as React from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function BunkPicker({ divisions, bunks }: { divisions: { id: string; name: string }[]; bunks: { id: string; division_id: string; name: string }[] }) {
  const [division, setDivision] = React.useState(divisions[0]?.id ?? "");
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="division_id">Division</Label>
        <Select id="division_id" name="division_id" value={division} onChange={(e) => setDivision(e.target.value)} required>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="bunk_id">Bunk</Label>
        <Select id="bunk_id" name="bunk_id" defaultValue="">
          <option value="">All bunks in the division</option>
          {bunks
            .filter((b) => b.division_id === division)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </Select>
      </div>
    </>
  );
}
