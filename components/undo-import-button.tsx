import { Undo2 } from "lucide-react";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { revertImportAction } from "@/app/(app)/admin/imports/actions";

export function UndoImportButton({ id, fileName, size = "default" }: { id: string; fileName: string; size?: "default" | "sm" }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size={size}>
          <Undo2 /> Undo this import
        </Button>
      }
      title="Undo this import?"
      description={
        <div className="space-y-2">
          <p>
            Everything goes back to how it was before <strong dir="auto">{fileName}</strong> was applied:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Campers it added are removed, except anyone who already checked in: they stay, marked &ldquo;not in the latest export&rdquo;.</li>
            <li>Campers you archived from its &ldquo;not in file&rdquo; list come back.</li>
            <li>Details it changed go back to their previous values.</li>
            <li>Divisions and bunks it created are removed if they are empty.</li>
            <li>Changes staff made by hand after the import are kept.</li>
          </ul>
        </div>
      }
      action={revertImportAction}
      submitLabel="Undo import"
      destructive
    >
      <input type="hidden" name="id" value={id} />
    </FormDialog>
  );
}
