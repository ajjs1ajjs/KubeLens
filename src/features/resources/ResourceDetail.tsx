import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAge, meta, podSummary, readyReplicas, readPath } from "@/lib/k8s/object";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";
import { LogsViewer } from "./LogsViewer";
import { podContainers } from "./pod-containers";
import { PodMetricsTab } from "./PodMetricsTab";
import { PortForwardDialog } from "./PortForwardDialog";
import { TerminalTab } from "./TerminalTab";

interface ResourceDetailProps {
  kind: string;
  object: K8sObject | null;
  ctx: ResourceContext | null;
  onOpenChange: (open: boolean) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 truncate text-xs">{children}</span>
    </div>
  );
}

export function ResourceDetail({ kind, object, ctx, onOpenChange }: ResourceDetailProps) {
  const { t } = useTranslation();
  const [portForwardOpen, setPortForwardOpen] = useState(false);
  const raw = useMemo(() => (object ? JSON.stringify(object, null, 2) : ""), [object]);

  if (!object) return null;
  const m = meta(object);
  const isPod = kind === "Pod";
  const phase = readPath(object, "/status/phase");
  const replicas = readyReplicas(object);
  const pod = podSummary(object);
  const image =
    typeof readPath(object, "/spec/containers/0/image") === "string"
      ? String(readPath(object, "/spec/containers/0/image"))
      : undefined;
  const containers = isPod ? podContainers(object) : [];
  const resourceCtx = isPod && ctx ? { ...ctx, namespace: m.namespace ?? ctx.namespace } : null;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            <span className="text-muted-foreground mr-2 text-xs font-normal">{kind}</span>
            {m.name}
          </SheetTitle>
          <SheetDescription>
            {m.namespace ? `${m.namespace} · ` : `${t("common.clusterScoped")} · `}
            created {formatAge(m.creationTimestamp)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(m.labels).map(([key, value]) => (
              <Badge key={key} variant="secondary">
                {key}={value}
              </Badge>
            ))}
            {Object.keys(m.labels).length === 0 && (
              <span className="text-muted-foreground text-xs">
                {t("resources.detail.noLabels")}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 rounded-md border p-3">
            <Field label={t("resources.detail.phase")}>
              {typeof phase === "string" ? phase : "—"}
            </Field>
            {replicas && <Field label="Ready">{replicas}</Field>}
            {pod.ready && <Field label="Ready">{pod.ready}</Field>}
            {typeof pod.restarts === "number" && pod.restarts > 0 && (
              <Field label={t("resources.detail.restarts")}>{pod.restarts}</Field>
            )}
            {image && <Field label={t("resources.detail.image")}>{image}</Field>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isPod && resourceCtx && (
              <Button size="sm" variant="outline" onClick={() => setPortForwardOpen(true)}>
                {t("resources.detail.portForward")}
              </Button>
            )}
            <span className="text-muted-foreground ml-auto text-xs">
              {containers.length > 1
                ? t("resources.detail.containers", { count: containers.length })
                : containers.length === 1
                  ? t("resources.detail.oneContainer")
                  : ""}
            </span>
          </div>

          <Tabs defaultValue="raw" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="w-fit">
              <TabsTrigger value="raw">{t("resources.detail.rawJson")}</TabsTrigger>
              {isPod && resourceCtx && (
                <>
                  <TabsTrigger value="metrics">{t("resources.detail.metrics")}</TabsTrigger>
                  <TabsTrigger value="logs">{t("resources.detail.logs")}</TabsTrigger>
                  <TabsTrigger value="terminal">{t("resources.detail.terminal")}</TabsTrigger>
                </>
              )}
            </TabsList>
            <TabsContent value="raw" className="min-h-0 flex-1 overflow-auto">
              <pre className="bg-muted/50 rounded-md p-3 text-xs">{raw}</pre>
            </TabsContent>
            {isPod && resourceCtx && (
              <TabsContent value="metrics" className="min-h-0 flex-1 overflow-auto">
                <PodMetricsTab ctx={resourceCtx} name={m.name} pod={object} />
              </TabsContent>
            )}
            {isPod && resourceCtx && (
              <TabsContent value="logs" className="min-h-0 flex-1 overflow-auto">
                <LogsViewer ctx={resourceCtx} name={m.name} containers={containers} />
              </TabsContent>
            )}
            {isPod && resourceCtx && (
              <TabsContent value="terminal" className="min-h-0 flex-1 overflow-hidden">
                <TerminalTab ctx={resourceCtx} name={m.name} containers={containers} />
              </TabsContent>
            )}
          </Tabs>
        </div>

        {isPod && resourceCtx && (
          <PortForwardDialog
            open={portForwardOpen}
            onOpenChange={setPortForwardOpen}
            ctx={resourceCtx}
            name={m.name}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
