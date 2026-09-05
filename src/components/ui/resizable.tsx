import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ResizablePanelProps {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  children: React.ReactNode;
  className?: string;
}

export function ResizablePanel({
  defaultWidth = 560,
  minWidth = 380,
  maxWidth = 960,
  children,
  className,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

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
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
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
    [width, minWidth, maxWidth],
  );

  const expand = useCallback(() => {
    setWidth((w) => (w < maxWidth - 40 ? maxWidth - 120 : defaultWidth));
  }, [defaultWidth, maxWidth]);

  return (
    <div className={cn("flex h-full shrink-0", className)} style={{ width }}>
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={expand}
        title="Drag to resize, double-click to expand"
        className={cn(
          "group flex w-3 shrink-0 cursor-col-resize items-center justify-center transition-colors",
          isResizing ? "bg-primary/10" : "hover:bg-primary/10",
        )}
      >
        <div
          className={cn(
            "rounded-full transition-all",
            isResizing
              ? "bg-primary h-20 w-1.5 shadow"
              : "bg-border group-hover:bg-primary/60 h-16 w-1 group-hover:w-1.5",
          )}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
