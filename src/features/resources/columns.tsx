/* eslint-disable react-refresh/only-export-components */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Badge } from "@/components/ui/badge";
import {
  formatAge,
  meta,
  nodeReady,
  nodeRoles,
  podSummary,
  readPath,
  readyReplicas,
} from "@/lib/k8s/object";
import type { K8sObject, NodeMetric, PodMetric } from "@/lib/k8s/types";
import { formatCpu, formatMemory } from "./use-metrics";

export interface ResourceColumn {
  id: string;
  header: string;
  /** Optional key for sorting (TanStack accessorKey). */
  accessorKey?: string;
  /** Renders the cell for an object. */
  cell: (obj: K8sObject) => ReactNode;
}

function Age({ obj }: { obj: K8sObject }) {
  return (
    <span className="text-muted-foreground whitespace-nowrap">
      {formatAge(meta(obj).creationTimestamp)}
    </span>
  );
}

function Name({ obj }: { obj: K8sObject }) {
  return <span className="font-medium">{meta(obj).name}</span>;
}

function StatusBadge({
  value,
  tone,
}: {
  value: string;
  tone: "green" | "red" | "yellow" | "gray";
}) {
  const variants = {
    green: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    red: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
    yellow: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
    gray: "border-transparent bg-muted text-muted-foreground",
  };
  return <Badge className={variants[tone]}>{value}</Badge>;
}

/** Phase with coloring for pods/namespaces. */
function Phase({ obj, path = "/status/phase" }: { obj: K8sObject; path?: string }) {
  const value = readPath(obj, path);
  if (typeof value !== "string") return <span className="text-muted-foreground">—</span>;
  const tone =
    value === "Running" || value === "Active"
      ? "green"
      : value === "Succeeded"
        ? "gray"
        : value === "Pending"
          ? "yellow"
          : value === "Failed" || value === "Terminating"
            ? "red"
            : "gray";
  return <StatusBadge value={value} tone={tone} />;
}

function Replicas({ obj }: { obj: K8sObject }) {
  const value = readyReplicas(obj);
  if (!value) return <span className="text-muted-foreground">—</span>;
  const [ready, desired] = value.split("/").map(Number);
  const tone = ready >= desired && desired > 0 ? "green" : "yellow";
  return <StatusBadge value={value} tone={tone} />;
}

function PodReady({ obj }: { obj: K8sObject }) {
  const { ready, restarts } = podSummary(obj);
  if (!ready) return <span className="text-muted-foreground">—</span>;
  const [r, d] = ready.split("/").map(Number);
  const tone = r >= d && d > 0 ? "green" : "yellow";
  return (
    <div className="flex items-center gap-2">
      <StatusBadge value={ready} tone={tone} />
      {restarts ? <span className="text-muted-foreground text-xs">{restarts} restarts</span> : null}
    </div>
  );
}

function NodeStatus({ obj }: { obj: K8sObject }) {
  const ready = nodeReady(obj);
  if (ready === undefined) return <span className="text-muted-foreground">—</span>;
  return <StatusBadge value={ready ? "Ready" : "Not Ready"} tone={ready ? "green" : "red"} />;
}

function DataCount({ obj, path }: { obj: K8sObject; path: string }) {
  const data = readPath(obj, path);
  const count =
    data && typeof data === "object" ? Object.keys(data as Record<string, unknown>).length : 0;
  return <span>{count}</span>;
}

function GenericStatus({ obj }: { obj: K8sObject }) {
  const phase = readPath(obj, "/status/phase");
  if (typeof phase === "string") {
    const tone =
      phase === "Running" || phase === "Active" || phase === "Bound"
        ? "green"
        : phase === "Pending" || phase === "Pending/ContainerCreating"
          ? "yellow"
          : "gray";
    return <StatusBadge value={phase} tone={tone} />;
  }
  return <span className="text-muted-foreground">—</span>;
}

/** CPU/memory metric columns, keyed by object name. */
export interface MetricsLookup {
  pod: Map<string, PodMetric> | null;
  node: Map<string, NodeMetric> | null;
}

function CpuCell({ obj, lookup }: { obj: K8sObject; lookup: MetricsLookup }) {
  const name = meta(obj).name;
  const pod = lookup.pod?.get(name);
  const node = lookup.node?.get(name);
  const value = pod?.cpuMillicores ?? node?.cpuMillicores;
  if (value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{formatCpu(value)}</span>;
}

function MemCell({ obj, lookup }: { obj: K8sObject; lookup: MetricsLookup }) {
  const name = meta(obj).name;
  const pod = lookup.pod?.get(name);
  const node = lookup.node?.get(name);
  const value = pod?.memoryBytes ?? node?.memoryBytes;
  if (value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{formatMemory(value)}</span>;
}

function metricColumns(lookup: MetricsLookup, t: TFunction): ResourceColumn[] {
  return [
    {
      id: "cpu",
      header: t("resources.columns.cpu"),
      cell: (o) => <CpuCell obj={o} lookup={lookup} />,
    },
    {
      id: "memory",
      header: t("resources.columns.memory"),
      cell: (o) => <MemCell obj={o} lookup={lookup} />,
    },
  ];
}

/** Column configs for a resource kind. */
export function resourceColumns(
  kind: string,
  metrics?: MetricsLookup,
  t?: TFunction,
): ResourceColumn[] {
  const tr = (t ?? ((key: string) => key)) as TFunction;
  const name: ResourceColumn = {
    id: "name",
    header: tr("resources.columns.name"),
    accessorKey: "metadata.name",
    cell: (o) => <Name obj={o} />,
  };
  const namespace: ResourceColumn = {
    id: "namespace",
    header: tr("resources.columns.namespace"),
    accessorKey: "metadata.namespace",
    cell: (o) => <span className="text-muted-foreground">{meta(o).namespace ?? "—"}</span>,
  };
  const age: ResourceColumn = {
    id: "age",
    header: tr("resources.columns.age"),
    accessorKey: "metadata.creationTimestamp",
    cell: (o) => <Age obj={o} />,
  };

  switch (kind) {
    case "Pod":
      return [
        name,
        namespace,
        { id: "ready", header: tr("resources.columns.ready"), cell: (o) => <PodReady obj={o} /> },
        { id: "status", header: tr("resources.columns.status"), cell: (o) => <Phase obj={o} /> },
        ...(metrics ? metricColumns(metrics, tr) : []),
        age,
      ];
    case "Deployment":
    case "StatefulSet":
    case "DaemonSet":
    case "ReplicaSet":
      return [
        name,
        namespace,
        { id: "ready", header: tr("resources.columns.ready"), cell: (o) => <Replicas obj={o} /> },
        age,
      ];
    case "Job":
      return [
        name,
        namespace,
        {
          id: "completions",
          header: tr("resources.columns.completions"),
          cell: (o) => <Replicas obj={o} />,
        },
        age,
      ];
    case "Service":
      return [
        name,
        namespace,
        {
          id: "type",
          header: tr("resources.columns.type"),
          accessorKey: "spec.type",
          cell: (o) => <span>{String(readPath(o, "/spec/type") ?? "—")}</span>,
        },
        {
          id: "cluster-ip",
          header: tr("resources.columns.clusterIp"),
          accessorKey: "spec.clusterIP",
          cell: (o) => (
            <span className="text-muted-foreground">
              {String(readPath(o, "/spec/clusterIP") ?? "—")}
            </span>
          ),
        },
        age,
      ];
    case "Node":
      return [
        name,
        {
          id: "status",
          header: tr("resources.columns.status"),
          cell: (o) => <NodeStatus obj={o} />,
        },
        {
          id: "roles",
          header: tr("resources.columns.roles"),
          cell: (o) => (
            <span className="text-muted-foreground">{nodeRoles(o).join(", ") || "—"}</span>
          ),
        },
        ...(metrics ? metricColumns(metrics, tr) : []),
        {
          id: "version",
          header: tr("resources.columns.version"),
          cell: (o) => (
            <span className="text-muted-foreground">
              {String(readPath(o, "/status/nodeInfo/kubeletVersion") ?? "—")}
            </span>
          ),
        },
        age,
      ];
    case "Namespace":
      return [
        name,
        { id: "status", header: tr("resources.columns.status"), cell: (o) => <Phase obj={o} /> },
        age,
      ];
    case "ConfigMap":
    case "Secret":
      return [
        name,
        namespace,
        {
          id: "data",
          header: tr("resources.columns.data"),
          cell: (o) => <DataCount obj={o} path={kind === "Secret" ? "/data" : "/data"} />,
        },
        age,
      ];
    case "PersistentVolume":
    case "PersistentVolumeClaim":
      return [
        name,
        namespace,
        { id: "status", header: tr("resources.columns.status"), cell: (o) => <Phase obj={o} /> },
        {
          id: "capacity",
          header: tr("resources.columns.capacity"),
          accessorKey: "spec.capacity.storage",
          cell: (o) => (
            <span className="text-muted-foreground">
              {String(readPath(o, "/spec/capacity/storage") ?? "—")}
            </span>
          ),
        },
        age,
      ];
    case "Ingress":
      return [
        name,
        namespace,
        {
          id: "class",
          header: tr("resources.columns.class"),
          accessorKey: "spec.ingressClassName",
          cell: (o) => (
            <span className="text-muted-foreground">
              {String(readPath(o, "/spec/ingressClassName") ?? "—")}
            </span>
          ),
        },
        {
          id: "address",
          header: tr("resources.columns.address"),
          cell: (o) => (
            <span className="text-muted-foreground">
              {String(readPath(o, "/status/loadBalancer/ingress/0/ip") ?? "—")}
            </span>
          ),
        },
        age,
      ];
    default:
      return [
        name,
        ...(needsNamespace(kind) ? [namespace] : []),
        {
          id: "status",
          header: tr("resources.columns.status"),
          cell: (o) => <GenericStatus obj={o} />,
        },
        age,
      ];
  }
}

/** Columns for a resource kind, translated via the active locale. */
export function useResourceColumns(kind: string, metrics?: MetricsLookup): ResourceColumn[] {
  const { t } = useTranslation();
  return useMemo(() => resourceColumns(kind, metrics, t), [kind, metrics, t]);
}

function needsNamespace(kind: string): boolean {
  return ![
    "ClusterRole",
    "ClusterRoleBinding",
    "StorageClass",
    "VolumeAttachment",
    "CSIDriver",
    "IngressClass",
    "PriorityClass",
    "CustomResourceDefinition",
  ].includes(kind);
}
