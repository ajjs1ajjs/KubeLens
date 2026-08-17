import { useState } from "react";
import { Loader2, Pause, Play, RefreshCw } from "lucide-react";
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
}

/** Tail/follow logs for a pod with a container picker. */
export function LogsViewer({ ctx, name, containers }: LogsViewerProps) {
  const [container, setContainer] = useState(containers[0] ?? "");
  const logs = useLogs(ctx, name, container || undefined);

  const text = [logs.text ?? "", ...logs.liveLines].filter(Boolean).join("\n");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        {containers.length > 1 && (
          <Select value={container} onValueChange={setContainer}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder="Container" />
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
          <Button variant="ghost" size="icon-sm" aria-label="Refresh logs" onClick={logs.refresh}>
            <RefreshCw className="size-3.5" />
          </Button>
          {logs.following ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Stop following logs"
              onClick={logs.stopFollowing}
            >
              <Pause className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Follow logs"
              onClick={logs.startFollowing}
            >
              <Play className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="bg-muted/50 relative min-h-0 flex-1 overflow-auto rounded-md border p-3">
        {logs.isPending ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Loading logs…
          </div>
        ) : logs.error ? (
          <p className="text-destructive text-xs">{logs.error}</p>
        ) : text ? (
          <pre className="font-mono text-xs whitespace-pre-wrap">{text}</pre>
        ) : (
          <p className="text-muted-foreground text-xs">No logs available.</p>
        )}
      </div>
    </div>
  );
}
