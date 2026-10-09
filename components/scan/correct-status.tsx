"use client";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { STATUS_LABEL, type CamperStatus } from "@/lib/attendance/machine";
import { correctStatus } from "@/app/(app)/scan/actions";

/** Directors fix a wrong status directly (a missed scan, a mistaken tap). Recorded with the reason. */
export function CorrectStatus({ camperId, status }: { camperId: string; status: CamperStatus }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          Correct status
        </Button>
      }
      title="Correct status"
      description="Use this when a scan was missed or tapped by mistake. Everyone sees the change and your reason in the timeline."
      action={correctStatus}
      submitLabel="Save correction"
    >
      <input type="hidden" name="camper_id" value={camperId} />
      <Field label="Status should be" htmlFor="status">
        <Select id="status" name="status" defaultValue={status}>
          {(Object.keys(STATUS_LABEL) as CamperStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Why" htmlFor="note">
        <Input id="note" name="note" required placeholder="e.g. Went home with grandparents, wasn't scanned" dir="auto" />
      </Field>
    </FormDialog>
  );
}
