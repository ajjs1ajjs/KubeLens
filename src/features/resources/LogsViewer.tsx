import * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownToLine, Download, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLogs } from "./use-logs";
import type { ResourceContext } from "@/lib/k8s/types";

interface LogsViewerProps {
  ctx: ResourceContext;
  name: string;
  /** Container names available in the pod; falls back to a free-text entry. */
  containers: string[];
  /** Pre-selected container (e.g. from container actions menu). */
  selectedContainer?: string;
}

/** Tail/follow logs for a pod with a container picker — unified scroll with follow. */
export function LogsViewer({ ctx, name, containers, selectedContainer }: LogsViewerProps) {
  const { t } = useTranslation();
  const [container, setContainer] = useState(selectedContainer ?? containers[0] ?? "");
  const logs = useLogs(ctx, name, container || undefined);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const text = [logs.text ?? "", ...logs.liveLines].filter(Boolean).join("\n");

  const handleSave = React.useCallback(() => {
    if (!text) return;
    const fileName = `${name}-${container || "logs"}.log`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [text, name, container]);

  React.useEffect(() => {
    if (logs.following && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, logs.following]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        {containers.length > 1 && (
          <Select value={container} onValueChange={setContainer}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder={t("resources.logs.container")} />
            </SelectTrigger>
            <SelectContent>
              {containers.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {logs.followError && <span className="text-destructive text-xs">{logs.followError}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("resources.logs.refresh")}
            onClick={logs.refresh}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("resources.logs.save")}
            onClick={() => void handleSave()}
            disabled={!text}
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Scroll to bottom"
            onClick={() => scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight)}
          >
            <ArrowDownToLine className="size-3.5" />
          </Button>
          {logs.following ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("resources.logs.stopFollowing")}
              onClick={logs.stopFollowing}
            >
              <Pause className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("resources.logs.follow")}
              onClick={logs.startFollowing}
            >
              <Play className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="bg-muted/50 relative min-h-0 flex-1 overflow-auto rounded-md border p-3 scrollbar-thin"
      >
        {logs.isPending ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            {t("resources.logs.loading")}
          </div>
        ) : logs.error ? (
          <p className="text-destructive text-xs">{logs.error}</p>
        ) : text ? (
          <pre className="font-mono text-xs whitespace-pre-wrap">{text}</pre>
        ) : (
          <p className="text-muted-foreground text-xs">{t("resources.logs.noLogs")}</p>
        )}
      </div>
    </div>
  );
}
