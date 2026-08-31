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
  defaultWidth = 420,
  minWidth = 300,
  maxWidth = 800,
  children,
  className,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
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

  return (
    <div className={cn("flex h-full shrink-0", className)} style={{ width }}>
      <div
        onMouseDown={onMouseDown}
        className="bg-border hover:bg-primary/40 w-1 cursor-col-resize shrink-0 transition-colors"
      />
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
