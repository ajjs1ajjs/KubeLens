import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatAge, meta, podSummary, readyReplicas, readPath } from "@/lib/k8s/object";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";
import { manifestFromObject } from "./manifest";
import { podContainerInfo, type ContainerInfo } from "./pod-container-info";
import { podContainers } from "./pod-containers";
import { ContainerActionsMenu } from "./ContainerActionsMenu";
import { ContainerDetail } from "./ContainerDetail";
import { YamlEditor } from "./yaml-editor";
import { LogsViewer } from "./LogsViewer";
import { PodMetricsTab } from "./PodMetricsTab";

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

function TagPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-1">
      <span className="text-muted-foreground text-xs font-medium">{label}:</span>
      <span className="text-xs">{value}</span>
    </div>
  );
}

const PHASE_TONE: Record<string, "green" | "red" | "yellow" | "gray"> = {
  Running: "green",
  Active: "green",
  Succeeded: "gray",
  Pending: "yellow",
  Failed: "red",
  Terminating: "red",
};
type Tone = "green" | "red" | "yellow" | "gray";

function StatusBadge({ value, tone }: { value: string; tone: Tone }) {
  const variants: Record<Tone, string> = {
    green: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    red: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
    yellow: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
    gray: "border-transparent bg-muted text-muted-foreground",
  };
  return <Badge className={variants[tone]}>{value}</Badge>;
}

function PhaseBadge({ value }: { value: string | undefined }) {
  if (typeof value !== "string") return null;
  const tone = PHASE_TONE[value] ?? "gray";
  return <StatusBadge value={value} tone={tone} />;
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span>{title}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-5"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </Button>
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

function ContainerCard({
  info,
  ctx,
  onLogs,
}: {
  info: ContainerInfo;
  ctx: ResourceContext | null;
  onLogs: (container: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stateTone: Tone =
    info.state === "Running"
      ? "green"
      : info.state === "Terminated"
        ? info.ready
          ? "gray"
          : "red"
        : info.state === "Waiting"
          ? "yellow"
          : "gray";

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 text-xs font-medium hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {info.name}
        </button>
        <StatusBadge value={info.state} tone={stateTone} />
        {info.restartCount > 0 && (
          <span className="text-muted-foreground text-xs">{info.restartCount} restarts</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {ctx && (
            <ContainerActionsMenu
              container={info.name}
              actions={{
                onLogs,
              }}
            />
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t px-2.5 py-2">
          <ContainerDetail info={info} />
        </div>
      )}
    </div>
  );
}

export function ResourceDetail({
  kind,
  object,
  ctx,
  onOpenChange,
  defaultTab,
}: ResourceDetailProps & { defaultTab?: string }) {
  const { t } = useTranslation();
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(
    () => defaultTab ?? (kind === "Pod" ? "logs" : "yaml"),
  );
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const tabsAnchorRef = React.useRef<HTMLDivElement>(null);

  // Sync tab from parent (e.g. Logs from row menu) — intentional single state sync
  useEffect(() => {
    if (defaultTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(defaultTab);
    }
  }, [defaultTab, object]);

  useEffect(() => {
    if (
      (activeTab === "logs" || activeTab === "metrics") &&
      typeof tabsAnchorRef.current?.scrollIntoView === "function" &&
      scrollContainerRef.current
    ) {
      tabsAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeTab]);

  const raw = useMemo(() => (object ? JSON.stringify(object, null, 2) : ""), [object]);
  const yamlContent = useMemo(() => (object ? manifestFromObject(object) : ""), [object]);

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
  const containerNames = isPod ? podContainers(object) : [];
  const qos = readPath(object, "/status/qosClass");
  const podIP = readPath(object, "/status/podIP");
  const ownerRef = readPath(object, "/metadata/ownerReferences");
  const controlledBy =
    Array.isArray(ownerRef) && ownerRef.length > 0
      ? (ownerRef[0] as { kind?: string; name?: string })
      : undefined;
  const nodeName = readPath(object, "/spec/nodeName");
  const hasAnnotations = Object.keys(m.annotations).length > 0;

  return (
    <div className="bg-background flex h-full flex-col overflow-hidden border-l">
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

      {/* Unified vertical scroll — top-bottom as one menu */}
      <div
        ref={scrollContainerRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        {/* Labels */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(m.labels).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="text-[11px]">
              {key}={value}
            </Badge>
          ))}
          {Object.keys(m.labels).length === 0 && (
            <span className="text-muted-foreground text-xs">{t("resources.detail.noLabels")}</span>
          )}
        </div>

        {/* Annotations */}
        {hasAnnotations && (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              {t("resources.detail.annotations")}
            </span>
            {Object.entries(m.annotations).map(([key, value]) => (
              <TagPair key={key} label={key} value={value} />
            ))}
          </div>
        )}

        {/* Status Card */}
        <div className="bg-background rounded-md border p-3">
          <div className="flex flex-col gap-1.5">
            <Field label={t("resources.detail.phase")}>
              <PhaseBadge value={typeof phase === "string" ? phase : undefined} />
            </Field>
            {replicas && <Field label="Ready">{replicas}</Field>}
            {pod.ready && <Field label="Ready">{pod.ready}</Field>}
            {typeof pod.restarts === "number" && pod.restarts > 0 && (
              <Field label={t("resources.detail.restarts")}>{pod.restarts}</Field>
            )}
            {image && <Field label={t("resources.detail.image")}>{image}</Field>}
            {isPod && typeof qos === "string" && qos && (
              <Field label={t("resources.detail.qos")}>{qos}</Field>
            )}
            {isPod && typeof nodeName === "string" && nodeName && (
              <Field label={t("resources.detail.node")}>{nodeName}</Field>
            )}
            {isPod && typeof podIP === "string" && podIP && (
              <Field label={t("resources.detail.podIP")}>{podIP}</Field>
            )}
            {controlledBy && (
              <Field label={t("resources.detail.controlledBy")}>
                {controlledBy.kind}/{controlledBy.name}
              </Field>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground ml-auto text-xs">
            {containerNames.length > 1
              ? t("resources.detail.containers", { count: containerNames.length })
              : containerNames.length === 1
                ? t("resources.detail.oneContainer")
                : ""}
          </span>
        </div>

        {/* Pod Container Details */}
        {isPod && containerNames.length > 0 && (
          <CollapsibleSection title={t("resources.detail.containersTitle")}>
            <div className="flex flex-col gap-2">
              {podContainerInfo(object).map((info) => (
                <ContainerCard
                  key={info.name}
                  info={info}
                  ctx={resourceCtx}
                  onLogs={(container) => {
                    setSelectedContainer(container);
                    setActiveTab("logs");
                  }}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}
        {/* Tabs — Pod: Logs+Metrics, other kinds: YAML/Raw — same sheet design */}
        {isPod && resourceCtx ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
            <div
              ref={tabsAnchorRef}
              className="bg-background sticky top-0 z-10 -mx-4 shrink-0 border-y px-2 py-2"
            >
              <TabsList className="grid h-8 w-full grid-cols-2 gap-1 p-1">
                <TabsTrigger value="metrics" className="min-w-0 px-1 text-[11px] sm:text-xs">
                  {t("resources.detail.metrics")}
                </TabsTrigger>
                <TabsTrigger value="logs" className="min-w-0 px-1 text-[11px] sm:text-xs">
                  {t("resources.detail.logs")}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="metrics" className="mt-3 data-[state=inactive]:hidden">
              <PodMetricsTab ctx={resourceCtx} name={m.name} pod={object} />
            </TabsContent>
            <TabsContent value="logs" className="mt-3 data-[state=inactive]:hidden">
              <div className="bg-background min-h-[420px] rounded-md border">
                <LogsViewer
                  ctx={resourceCtx}
                  name={m.name}
                  containers={containerNames}
                  selectedContainer={selectedContainer ?? undefined}
                />
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
            <div className="bg-background sticky top-0 z-10 -mx-4 shrink-0 border-y px-2 py-2">
              <TabsList className="grid h-8 w-full grid-cols-2 gap-1 p-1">
                <TabsTrigger value="yaml" className="min-w-0 px-1 text-[11px] sm:text-xs">
                  {t("resources.detail.yaml")}
                </TabsTrigger>
                <TabsTrigger value="raw" className="min-w-0 px-1 text-[11px] sm:text-xs">
                  {t("resources.detail.rawJson")}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="yaml" className="mt-3 data-[state=inactive]:hidden">
              <div className="bg-background min-h-[500px] rounded-md border">
                <YamlEditor
                  value={yamlContent}
                  onChange={() => {}}
                  readOnly
                  className="!border-0"
                />
              </div>
            </TabsContent>
            <TabsContent value="raw" className="mt-3 data-[state=inactive]:hidden">
              <pre className="bg-muted/50 rounded-md border p-3 text-xs break-all whitespace-pre-wrap">
                {raw}
              </pre>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
