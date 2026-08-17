import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { k8sApi } from "@/lib/k8s/api";
import { useActiveCluster, useClusterStore } from "./cluster-store";

/** Loads clusters from the backend and syncs them into the store. */
export function useClusters() {
  const query = useQuery({
    queryKey: ["clusters"],
    queryFn: () => k8sApi.listClusters(),
    staleTime: 30_000,
  });

  const syncClusters = useClusterStore((s) => s.syncClusters);

  useEffect(() => {
    if (query.data) syncClusters(query.data);
  }, [query.data, syncClusters]);

  return query;
}

/** Selects the current-context cluster once on first load. */
export function useAutoSelectCluster() {
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const clusters = useClusterStore((s) => s.clusters);

  useEffect(() => {
    if (activeClusterId || clusters.length === 0) return;
    const current = clusters.find((c) => c.current) ?? clusters[0];
    useClusterStore.getState().setActiveCluster(current.id);
  }, [activeClusterId, clusters]);
}

/** Connects the active cluster and records the result in the store. */
export function useActiveClusterConnect() {
  const active = useActiveCluster();
  const name = active?.name;
  const connected = active?.connected;

  useEffect(() => {
    if (!name || connected) return;
    let disposed = false;
    k8sApi
      .connectCluster(name)
      .then((summary) => {
        if (disposed) return;
        useClusterStore.getState().setClusterState(name, {
          connected: true,
          version: summary.version ?? undefined,
          error: undefined,
        });
      })
      .catch((error) => {
        if (disposed) return;
        useClusterStore
          .getState()
          .setClusterState(name, { connected: false, error: String(error) });
      });
    return () => {
      disposed = true;
    };
  }, [name, connected]);
}

/** Namespaces available on a cluster, for the header selector. */
export function useNamespaces(context: string | null) {
  return useQuery({
    queryKey: ["namespaces", context],
    queryFn: () => k8sApi.listNamespaces(context as string),
    enabled: !!context,
    staleTime: 60_000,
  });
}
