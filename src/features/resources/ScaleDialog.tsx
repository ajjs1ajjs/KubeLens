import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ScaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: string;
  name: string;
  initialReplicas: number;
  isSubmitting?: boolean;
  onSubmit: (replicas: number) => void;
}

function ScaleForm({
  initialReplicas,
  isSubmitting,
  onSubmit,
  onClose,
}: {
  initialReplicas: number;
  isSubmitting?: boolean;
  onSubmit: (replicas: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(initialReplicas));
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setInvalid(true);
      return;
    }
    onSubmit(parsed);
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <label className="text-muted-foreground text-xs" htmlFor="scale-replicas">
          {t("resources.scale.replicas")}
        </label>
        <Input
          id="scale-replicas"
          type="number"
          min={0}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          aria-invalid={invalid}
        />
        {invalid && <p className="text-destructive text-xs">{t("resources.scale.invalid")}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} disabled={isSubmitting}>
          {t("resources.scale.apply")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ScaleDialog({
  open,
  onOpenChange,
  kind,
  name,
  initialReplicas,
  isSubmitting,
  onSubmit,
}: ScaleDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("resources.scale.title", { kind })}</DialogTitle>
          <DialogDescription>{t("resources.scale.description", { name })}</DialogDescription>
        </DialogHeader>
        {open && (
          <ScaleForm
            key={initialReplicas}
            initialReplicas={initialReplicas}
            isSubmitting={isSubmitting}
            onSubmit={onSubmit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
