import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const m = object ? meta(object) : null;
  const isPod = kind === "Pod";
  const resourceCtx = useMemo(
    () => (isPod && ctx && m ? { ...ctx, namespace: m.namespace ?? ctx.namespace } : null),
    [isPod, ctx, m],
  );

  if (!object || !m) return null;
  const phase = readPath(object, "/status/phase");
  const replicas = readyReplicas(object);
  const pod = podSummary(object);
  const image =
    typeof readPath(object, "/spec/containers/0/image") === "string"
      ? String(readPath(object, "/spec/containers/0/image"))
      : undefined;
  const containers = isPod ? podContainers(object) : [];

  return (
    <div className="bg-background flex h-full flex-col border-l">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <div className="text-muted-foreground text-xs font-normal">{kind}</div>
          <div className="truncate text-sm font-medium">{m.name}</div>
          <div className="text-muted-foreground text-xs">
            {m.namespace ? `${m.namespace} · ` : `${t("common.clusterScoped")} · `}
            created {formatAge(m.creationTimestamp)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onOpenChange(false)}
          className="shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(m.labels).map(([key, value]) => (
            <Badge key={key} variant="secondary">
              {key}={value}
            </Badge>
          ))}
          {Object.keys(m.labels).length === 0 && (
            <span className="text-muted-foreground text-xs">{t("resources.detail.noLabels")}</span>
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
    </div>
  );
}
