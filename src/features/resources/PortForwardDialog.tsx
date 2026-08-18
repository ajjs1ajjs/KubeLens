import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortForwards } from "./use-port-forwards";
import type { ResourceContext } from "@/lib/k8s/types";

interface PortForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: ResourceContext;
  name: string;
}

/** Start/stop port-forward tunnels to a pod. */
export function PortForwardDialog({ open, onOpenChange, ctx, name }: PortForwardDialogProps) {
  const { t } = useTranslation();
  const [remotePort, setRemotePort] = useState("8080");
  const { forwards, isPending, start, stop } = usePortForwards(ctx);

  const podForwards = forwards.filter((f) => f.name === name);

  const handleStart = () => {
    const port = Number(remotePort);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
    start.mutate({ name, remotePort: port });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("resources.portForward.title")}</DialogTitle>
          <DialogDescription>{t("resources.portForward.description", { name })}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="remote-port">{t("resources.portForward.remotePort")}</Label>
              <Input
                id="remote-port"
                value={remotePort}
                onChange={(event) => setRemotePort(event.target.value)}
                inputMode="numeric"
              />
            </div>
            <Button onClick={handleStart} disabled={start.isPending}>
              <Link2 className="size-4" />
              {t("resources.portForward.forward")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {podForwards.length === 0 && !isPending && (
              <p className="text-muted-foreground text-xs">
                {t("resources.portForward.noTunnels")}
              </p>
            )}
            {podForwards.map((forward) => (
              <div
                key={forward.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="text-xs">
                  <span className="font-medium">localhost:{forward.localPort}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    → {forward.name}:{forward.remotePort}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("resources.portForward.stop")}
                  onClick={() => stop.mutate(forward.id)}
                  disabled={stop.isPending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
