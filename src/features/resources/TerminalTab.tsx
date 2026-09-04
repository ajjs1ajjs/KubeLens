import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RotateCcw, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TerminalView } from "./TerminalView";
import { useTerminal } from "./use-terminal";
import type { ResourceContext } from "@/lib/k8s/types";

interface TerminalTabProps {
  ctx: ResourceContext;
  name: string;
  containers: string[];
  /** Pre-selected container (e.g. from container actions menu). */
  selectedContainer?: string;
}

/** Exec terminal for a pod with a container picker and reconnect control. */
export function TerminalTab({ ctx, name, containers, selectedContainer }: TerminalTabProps) {
  const { t } = useTranslation();
  const [container, setContainer] = useState(selectedContainer ?? containers[0] ?? "");
  const [nonce, setNonce] = useState(0);
  const session = useTerminal(ctx, name, container || undefined, ["/bin/sh"], nonce);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        {containers.length > 1 && (
          <Select value={container} onValueChange={setContainer}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder={t("resources.terminal.container")} />
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
        {session?.error && (
          <span className="text-destructive min-w-0 flex-1 truncate text-xs">{session.error}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("resources.terminal.restart")}
            onClick={() => setNonce((n) => n + 1)}
            disabled={session?.status === "connecting"}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border">
        {session ? (
          session.output || session.status !== "connecting" ? (
            <TerminalView session={session} />
          ) : (
            <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              {t("resources.terminal.connecting")}
            </div>
          )
        ) : (
          <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs">
            <TerminalSquare className="size-5 opacity-50" />
            {t("resources.terminal.notStarted")}
          </div>
        )}
      </div>
    </div>
  );
}
