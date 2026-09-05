import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Save, X, FileText, Code2 } from "lucide-react";
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Code2 className="size-3.5" />
          <span>YAML</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setValue(initialValue)}
          disabled={value === initialValue}
          aria-label={t("resources.yaml.reset")}
          className="h-7"
        >
          <RotateCcw className="size-3" />
          {t("resources.yaml.reset")}
        </Button>
      </div>
      <div className="bg-background flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-md border shadow-sm">
        <YamlEditor
          value={value}
          onChange={setValue}
          className="h-full w-full !border-0 !bg-transparent"
        />
      </div>
      <SheetFooter className="shrink-0 gap-2 border-t pt-3">
        <SheetClose asChild>
          <Button variant="outline">
            <X className="size-3.5" />
            {t("common.cancel")}
          </Button>
        </SheetClose>
        <Button onClick={() => onSubmit?.(value)} disabled={isSubmitting}>
          <Save className="size-3.5" />
          {submitKey ? t(submitKey) : (submitLabel ?? t("common.apply"))}
        </Button>
      </SheetFooter>
    </div>
  );
}

function ViewBody({ initialValue }: { initialValue: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden">
      <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
        <Code2 className="size-3.5" />
        <span>YAML</span>
      </div>
      <div className="bg-background flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-md border shadow-sm">
        <YamlEditor
          value={initialValue}
          onChange={() => {}}
          readOnly
          className="h-full w-full !border-0 !bg-transparent"
        />
      </div>
      <SheetFooter className="shrink-0 border-t pt-3">
        <SheetClose asChild>
          <Button variant="outline">
            <X className="size-3.5" />
            {t("common.close")}
          </Button>
        </SheetClose>
      </SheetFooter>
    </div>
  );
}

/**
 * Side-panel YAML editor with horizontal resize from the left edge.
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
  const [width, setWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(60);
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        const delta = startX.current - e.clientX;
        const deltaPercent = (delta / window.innerWidth) * 100;
        const newWidth = Math.min(90, Math.max(30, startWidth.current + deltaPercent));
        setWidth(newWidth);
      };

      const onMouseUp = () => {
        dragging.current = false;
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="bg-background flex w-screen flex-col gap-0 sm:max-w-none"
        style={{ width: `${width}vw`, maxWidth: `${width}vw` }}
      >
        <div
          onMouseDown={onMouseDown}
          className={`group absolute top-0 left-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center transition-colors ${
            isResizing ? "bg-primary/10" : "hover:bg-primary/5"
          }`}
        >
          <div
            className={`h-24 rounded-full transition-all duration-200 ${
              isResizing
                ? "bg-primary w-1.5 shadow-md"
                : "bg-border group-hover:bg-primary/60 w-1 group-hover:w-1.5"
            }`}
          />
          {isResizing && (
            <div className="bg-primary text-primary-foreground absolute top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium shadow-lg">
              {Math.round(width)}%
            </div>
          )}
        </div>
        <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden pr-5 pl-6">
          <SheetHeader className="shrink-0 border-b pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base font-semibold">{title}</SheetTitle>
                  {description && (
                    <SheetDescription className="mt-0.5 truncate text-xs">
                      {description}
                    </SheetDescription>
                  )}
                </div>
              </div>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground -mt-1 -mr-1"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </Button>
              </SheetClose>
            </div>
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
