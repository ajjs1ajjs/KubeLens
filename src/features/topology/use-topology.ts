import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { k8sApi } from "@/lib/k8s/api";
import { findResourceType } from "@/features/resources/resource-types";
import { buildTopology, layoutTopology, type TopologyGraph } from "./topology";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";

/** Resource kinds that participate in the dependency graph. */
export const TOPOLOGY_KINDS = [
  "Ingress",
  "Service",
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "ReplicaSet",
  "Job",
  "CronJob",
  "Pod",
  "ConfigMap",
  "Secret",
  "PersistentVolumeClaim",
] as const;

export function topologyQueryKey(ctx: ResourceContext): string[] {
  return ["topology", ctx.context, ctx.namespace || "__all__"];
}

function contextsFor(ctx: ResourceContext): ResourceContext[] {
  return TOPOLOGY_KINDS.map((kind) => {
    const meta = findResourceType(kind);
    return {
      context: ctx.context,
      group: meta?.group ?? "",
      version: meta?.version ?? "v1",
      kind,
      namespaced: meta?.namespaced ?? true,
      namespace: ctx.namespace,
    };
  });
}

/**
 * Fetches every graph-relevant resource kind in parallel and builds the
 * dependency graph with a layered layout.
 */
export function useTopology(ctx: ResourceContext | null) {
  const query = useQuery({
    queryKey: ctx ? topologyQueryKey(ctx) : ["topology", "none"],
    queryFn: async () => {
      const contexts = contextsFor(ctx as ResourceContext);
      const lists = await Promise.all(contexts.map((c) => k8sApi.listResources(c)));
      return lists.flat() as K8sObject[];
    },
    enabled: Boolean(ctx),
    staleTime: 30_000,
  });

  const graph = useMemo<TopologyGraph>(() => {
    const built = buildTopology(query.data ?? []);
    const { nodes, edges, metrics } = layoutTopology(built);
    return { nodes, edges, metrics };
  }, [query.data]);

  return { ...query, graph };
}
