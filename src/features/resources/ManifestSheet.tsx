import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { YamlEditor } from "./yaml-editor";

interface ManifestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialValue: string;
  submitLabel?: string;
  isSubmitting?: boolean;
  onSubmit?: (yaml: string) => void;
  readOnly?: boolean;
}

function EditableBody({
  initialValue,
  onSubmit,
  isSubmitting,
  submitLabel,
}: {
  initialValue: string;
  onSubmit: (yaml: string) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  const submitKey =
    submitLabel === "Apply" ? "common.apply" : submitLabel === "Save" ? "common.save" : undefined;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-1">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setValue(initialValue)}
            disabled={value === initialValue}
            aria-label={t("resources.yaml.reset")}
          >
            <RotateCcw className="size-3.5" />
            {t("resources.yaml.reset")}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <YamlEditor value={value} onChange={setValue} height="100%" />
        </div>
      </div>
      <SheetFooter className="border-t pt-3">
        <SheetClose asChild>
          <Button variant="outline">{t("common.cancel")}</Button>
        </SheetClose>
        <Button onClick={() => onSubmit?.(value)} disabled={isSubmitting}>
          <Save className="size-3.5" />
          {submitKey ? t(submitKey) : (submitLabel ?? t("common.apply"))}
        </Button>
      </SheetFooter>
    </>
  );
}

function ViewBody({ initialValue }: { initialValue: string }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden px-1">
        <YamlEditor value={initialValue} onChange={() => {}} height="100%" readOnly />
      </div>
      <SheetFooter className="border-t pt-3">
        <SheetClose asChild>
          <Button>{t("common.close")}</Button>
        </SheetClose>
      </SheetFooter>
    </>
  );
}

/**
 * Side-panel YAML editor used in Lens-style flows for creating, editing and
 * viewing resource manifests. Replaces the previous modal dialog with a wider
 * sheet so longer manifests stay readable.
 */
export function ManifestSheet({
  open,
  onOpenChange,
  title,
  description,
  initialValue,
  submitLabel,
  isSubmitting,
  onSubmit,
  readOnly,
}: ManifestSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-3 sm:max-w-3xl"
      >
        <SheetHeader className="border-b pb-3">
          <SheetTitle className="pr-8">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        {readOnly ? (
          <ViewBody key={initialValue} initialValue={initialValue} />
        ) : onSubmit ? (
          <EditableBody
            key={`${title}-${initialValue.length}`}
            initialValue={initialValue}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
            submitLabel={submitLabel}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
