import { useQuery } from "@tanstack/react-query";
import { k8sApi } from "@/lib/k8s/api";
import type { NodeMetric, PodMetric, ResourceContext } from "@/lib/k8s/types";

const METRICS_INTERVAL_MS = 15_000;

export function podMetricsQueryKey(ctx: ResourceContext): string[] {
  return ["metrics", "pods", ctx.context, ctx.namespace || "__all__"];
}

export function nodeMetricsQueryKey(ctx: ResourceContext): string[] {
  return ["metrics", "nodes", ctx.context];
}

/** Fetches pod CPU/memory usage, refreshing periodically. */
export function usePodMetrics(ctx: ResourceContext | null) {
  return useQuery({
    queryKey: ctx ? podMetricsQueryKey(ctx) : ["metrics", "pods", "none"],
    queryFn: () => k8sApi.getPodMetrics(ctx as ResourceContext),
    enabled: Boolean(ctx),
    refetchInterval: METRICS_INTERVAL_MS,
    staleTime: 5_000,
  });
}

/** Fetches node CPU/memory usage, refreshing periodically. */
export function useNodeMetrics(ctx: ResourceContext | null) {
  return useQuery({
    queryKey: ctx ? nodeMetricsQueryKey(ctx) : ["metrics", "nodes", "none"],
    queryFn: () => k8sApi.getNodeMetrics(ctx as ResourceContext),
    enabled: Boolean(ctx),
    refetchInterval: METRICS_INTERVAL_MS,
    staleTime: 5_000,
  });
}

/** Formats millicores as "125m" or "1.25". */
export function formatCpu(millicores: number): string {
  if (millicores >= 1000) {
    const cores = millicores / 1000;
    return `${cores.toFixed(2)}`;
  }
  return `${Math.round(millicores)}m`;
}

/** Formats bytes as "128 Mi" / "1.2 Gi" / "512 KiB". */
export function formatMemory(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} Gi`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} Mi`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${bytes} B`;
}

export interface PodMetricLookup {
  byName: Map<string, PodMetric>;
  list: PodMetric[];
}

export interface NodeMetricLookup {
  byName: Map<string, NodeMetric>;
  list: NodeMetric[];
}

export function toPodMetricLookup(metrics: PodMetric[] | undefined): PodMetricLookup {
  const list = metrics ?? [];
  return { byName: new Map(list.map((m) => [m.name, m])), list };
}

export function toNodeMetricLookup(metrics: NodeMetric[] | undefined): NodeMetricLookup {
  const list = metrics ?? [];
  return { byName: new Map(list.map((m) => [m.name, m])), list };
}
