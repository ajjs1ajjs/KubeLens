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
  const hasConfigs = useClusterStore((s) => s.configs.length > 0);

  useEffect(() => {
    // When managed configs exist, setConfigs owns the cluster list (ids are
    // `configId::context`). syncClusters would clobber it with active-config
    // only contexts and bare ids, so it applies to the default kubeconfig only.
    if (query.data && !hasConfigs) syncClusters(query.data);
  }, [query.data, syncClusters, hasConfigs]);

  return query;
}

/** Loads the managed cluster configs and syncs them into the store. */
export function useClusterConfigs() {
  const query = useQuery({
    queryKey: ["cluster-configs"],
    queryFn: () => k8sApi.listClusterConfigs(),
    staleTime: 10_000,
  });

  const setConfigs = useClusterStore((s) => s.setConfigs);

  useEffect(() => {
    if (query.data) setConfigs(query.data);
  }, [query.data, setConfigs]);

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
  const id = active?.id;
  const name = active?.name;
  const configId = active?.configId;
  const connected = active?.connected;
  const manualDisconnects = useClusterStore((s) => s.manualDisconnects);

  useEffect(() => {
    if (!id || !name || connected) return;
    if (manualDisconnects.has(id)) return;
    let disposed = false;
    k8sApi
      .connectCluster(name, configId)
      .then((summary) => {
        if (disposed) return;
        useClusterStore.getState().setClusterState(id, {
          connected: true,
          version: summary.version ?? undefined,
          error: undefined,
        });
      })
      .catch((error) => {
        if (disposed) return;
        useClusterStore.getState().setClusterState(id, { connected: false, error: String(error) });
      });
    return () => {
      disposed = true;
    };
  }, [id, name, configId, connected, manualDisconnects]);
}

/** Explicitly connects a cluster (by unique id + context/config). */
export async function connectCluster(id: string, name: string, configId?: string) {
  useClusterStore.getState().setManualDisconnect(id, false);
  try {
    const summary = await k8sApi.connectCluster(name, configId);
    useClusterStore.getState().setClusterState(id, {
      connected: true,
      version: summary.version ?? undefined,
      error: undefined,
    });
  } catch (error) {
    useClusterStore.getState().setClusterState(id, { connected: false, error: String(error) });
  }
}

/** Explicitly disconnects a cluster. */
export async function disconnectCluster(id: string, name: string, configId?: string) {
  await k8sApi.disconnectCluster(name, configId);
  useClusterStore.getState().setManualDisconnect(id, true);
  useClusterStore.getState().setClusterState(id, {
    connected: false,
    version: undefined,
    error: undefined,
  });
}

/** Namespaces available on a cluster, for the header selector. */
export function useNamespaces(context: string | null, configId?: string) {
  return useQuery({
    queryKey: ["namespaces", context, configId],
    queryFn: () => k8sApi.listNamespaces(context as string, configId),
    enabled: !!context,
    staleTime: 60_000,
  });
}
