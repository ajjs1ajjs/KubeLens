import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RestartConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: string;
  name: string;
  isSubmitting?: boolean;
  onConfirm: () => void;
}

export function RestartConfirmDialog({
  open,
  onOpenChange,
  kind,
  name,
  isSubmitting,
  onConfirm,
}: RestartConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("resources.restart.title", { kind })}</DialogTitle>
          <DialogDescription>{t("resources.restart.description", { name })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            <RefreshCw className="size-3.5" />
            {t("resources.restart.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
