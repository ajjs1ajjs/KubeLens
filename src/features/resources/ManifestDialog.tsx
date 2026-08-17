import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { YamlEditor } from "./yaml-editor";

interface ManifestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialValue: string;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (yaml: string) => void;
}

/** Modal with a YAML editor used to create or edit a resource manifest. */
export function ManifestDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValue,
  submitLabel,
  isSubmitting,
  onSubmit,
}: ManifestDialogProps) {
  // The dialog unmounts while closed, so state always starts from the
  // current initialValue on open.
  const [value, setValue] = useState(initialValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <YamlEditor value={value} onChange={setValue} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(value)} disabled={isSubmitting}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
