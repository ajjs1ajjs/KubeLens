import { create } from "zustand";
import type { ClusterConfig, ClusterSummary } from "@/lib/k8s/types";

export interface ClusterInfo {
  /** Unique id across configs: `configId::context`. */
  id: string;
  name: string;
  /** Id of the config this cluster belongs to. */
  configId?: string;
  /** API server URL, e.g. https://127.0.0.1:6443 */
  server: string;
  /** Namespace configured on the kubeconfig context, if any. */
  namespace?: string | null;
  /** Whether this context is the kubeconfig `current-context`. */
  current: boolean;
  connected: boolean;
  /** Kubernetes server version, filled after a successful connect. */
  version?: string | null;
  error?: string;
}

interface ClusterState {
  clusters: ClusterInfo[];
  activeClusterId: string | null;
  /** User-managed cluster configs (kubeconfig files). */
  configs: ClusterConfig[];
  /** Selected namespace; empty string means all namespaces. */
  activeNamespace: string;
  /** Clusters the user explicitly disconnected; suppress auto-reconnect. */
  manualDisconnects: ReadonlySet<string>;
  upsertCluster: (cluster: ClusterInfo) => void;
  removeCluster: (id: string) => void;
  setActiveCluster: (id: string | null) => void;
  setManualDisconnect: (id: string, disconnected: boolean) => void;
  setClusterState: (
    id: string,
    patch: Partial<Pick<ClusterInfo, "connected" | "error" | "version">>,
  ) => void;
  /** Reconciles the cluster list from the backend, preserving live state. */
  syncClusters: (summaries: ClusterSummary[]) => void;
  /** Replaces the managed config list (from backend). */
  setConfigs: (configs: ClusterConfig[]) => void;
  setActiveNamespace: (namespace: string) => void;
}

export const useClusterStore = create<ClusterState>((set) => ({
  clusters: [],
  activeClusterId: null,
  configs: [],
  activeNamespace: "",
  manualDisconnects: new Set<string>(),
  upsertCluster: (cluster) =>
    set((state) => {
      const exists = state.clusters.some((c) => c.id === cluster.id);
      return {
        clusters: exists
          ? state.clusters.map((c) => (c.id === cluster.id ? { ...c, ...cluster } : c))
          : [...state.clusters, cluster],
      };
    }),
  removeCluster: (id) =>
    set((state) => ({
      clusters: state.clusters.filter((c) => c.id !== id),
      activeClusterId: state.activeClusterId === id ? null : state.activeClusterId,
    })),
  setActiveCluster: (id) =>
    set((state) => {
      if (!id || !state.manualDisconnects.has(id)) return { activeClusterId: id };
      const manualDisconnects = new Set(state.manualDisconnects);
      manualDisconnects.delete(id);
      return { activeClusterId: id, manualDisconnects };
    }),
  setManualDisconnect: (id, disconnected) =>
    set((state) => {
      if (state.manualDisconnects.has(id) === disconnected) return {};
      const manualDisconnects = new Set(state.manualDisconnects);
      if (disconnected) manualDisconnects.add(id);
      else manualDisconnects.delete(id);
      return { manualDisconnects };
    }),
  setClusterState: (id, patch) =>
    set((state) => ({
      clusters: state.clusters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  syncClusters: (summaries) =>
    set((state) => {
      const previous = new Map(state.clusters.map((c) => [c.id, c]));
      const clusters: ClusterInfo[] = summaries.map((s) => {
        const prev = previous.get(s.name);
        return {
          id: s.name,
          name: s.name,
          server: s.server,
          namespace: s.namespace,
          current: s.current,
          connected: prev?.connected ?? false,
          version: prev?.version ?? s.version,
          error: prev?.error,
        };
      });
      const activeStillExists = clusters.some((c) => c.id === state.activeClusterId);
      return {
        clusters,
        activeClusterId: activeStillExists
          ? state.activeClusterId
          : (clusters.find((c) => c.current)?.id ?? null),
      };
    }),
  setConfigs: (configs) =>
    set((state) => {
      if (configs.length === 0) {
        // No managed configs: the cluster list comes from the default
        // kubeconfig via syncClusters, so keep it instead of wiping it.
        return { configs };
      }
      // Track connected state across all configs' contexts using a unique
      // `configId::context` id so same-named contexts don't collide.
      const previous = new Map(state.clusters.map((c) => [c.id, c]));
      const clusters: ClusterInfo[] = configs.flatMap((cfg) =>
        cfg.contexts.map((s) => {
          const id = `${cfg.id}::${s.name}`;
          const prev = previous.get(id);
          return {
            id,
            name: s.name,
            configId: cfg.id,
            server: s.server,
            namespace: s.namespace,
            current: s.current,
            connected: prev?.connected ?? false,
            version: prev?.version ?? s.version,
            error: prev?.error,
          };
        }),
      );
      const activeStillExists = clusters.some((c) => c.id === state.activeClusterId);
      return {
        configs,
        clusters,
        activeClusterId: activeStillExists
          ? state.activeClusterId
          : (clusters.find((c) => c.current)?.id ?? clusters[0]?.id ?? null),
      };
    }),
  setActiveNamespace: (namespace) => set({ activeNamespace: namespace }),
}));

export function useActiveCluster(): ClusterInfo | null {
  const clusters = useClusterStore((s) => s.clusters);
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  return clusters.find((c) => c.id === activeClusterId) ?? null;
}
