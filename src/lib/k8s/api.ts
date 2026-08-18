import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ClusterConfig,
  ClusterSummary,
  ExecEvent,
  HelmReleaseDetail,
  HelmReleaseRevision,
  HelmReleaseSummary,
  K8sObject,
  LogEvent,
  NodeMetric,
  PodMetric,
  PortForwardInfo,
  PortForwardStart,
  ResourceContext,
  WatchEvent,
} from "./types";

/** Event name used for watch traffic (matches the Rust backend). */
export const WATCH_EVENT = "kubelens://watch";
/** Event name used for follow-log traffic (matches the Rust backend). */
export const LOG_EVENT = "kubelens://logs";
/** Event name used for exec terminal traffic (matches the Rust backend). */
export const EXEC_EVENT = "kubelens://exec-output";

export const k8sApi = {
  listClusters: () => invoke<ClusterSummary[]>("list_clusters"),

  connectCluster: (context: string) => invoke<ClusterSummary>("connect_cluster", { context }),

  reloadKubeconfig: () => invoke<ClusterSummary[]>("reload_kubeconfig"),

  listClusterConfigs: () => invoke<ClusterConfig[]>("list_cluster_configs"),

  getClusterConfigs: () => invoke<ClusterConfig[]>("get_cluster_configs"),

  addClusterConfig: (path: string) => invoke<ClusterConfig[]>("add_cluster_config", { path }),

  renameClusterConfig: (id: string, name: string) =>
    invoke<ClusterConfig[]>("rename_cluster_config", { id, name }),

  removeClusterConfig: (id: string) => invoke<ClusterConfig[]>("remove_cluster_config", { id }),

  setActiveClusterConfig: (id: string | null) =>
    invoke<ClusterConfig[]>("set_active_cluster_config", { id }),

  listResources: (ctx: ResourceContext) => invoke<K8sObject[]>("list_resources", { ctx }),

  getResource: (ctx: ResourceContext, name: string) =>
    invoke<K8sObject>("get_resource", { ctx, name }),

  deleteResource: (ctx: ResourceContext, name: string) =>
    invoke<void>("delete_resource", { ctx, name }),

  applyYaml: (ctx: ResourceContext, yaml: string) => invoke<K8sObject>("apply_yaml", { ctx, yaml }),

  startWatch: (ctx: ResourceContext) => invoke<string>("start_watch", { ctx }),

  stopWatch: (id: string) => invoke<void>("stop_watch", { id }),

  listNamespaces: (context: string) => invoke<string[]>("list_namespaces", { context }),

  getLogs: (ctx: ResourceContext, name: string, container?: string, tailLines?: number) =>
    invoke<string>("get_logs", {
      ctx,
      name,
      container: container ?? null,
      tailLines: tailLines ?? null,
    }),

  followLogs: (ctx: ResourceContext, name: string, container?: string) =>
    invoke<string>("follow_logs", { ctx, name, container: container ?? null }),

  stopFollowLogs: (id: string) => invoke<void>("stop_follow_logs", { id }),

  execShell: (ctx: ResourceContext, name: string, container?: string, command?: string[]) =>
    invoke<string>("exec_shell", {
      ctx,
      name,
      container: container ?? null,
      command: command ?? ["/bin/sh"],
    }),

  execInput: (id: string, data: string) => invoke<void>("exec_input", { id, data }),

  stopExec: (id: string) => invoke<void>("stop_exec", { id }),

  startPortForward: (ctx: ResourceContext, name: string, remotePort: number) =>
    invoke<PortForwardStart>("start_port_forward", { ctx, name, remotePort }),

  listPortForwards: () => invoke<PortForwardInfo[]>("list_port_forwards"),

  stopPortForward: (id: string) => invoke<void>("stop_port_forward", { id }),

  getPodMetrics: (ctx: ResourceContext) => invoke<PodMetric[]>("get_pod_metrics", { ctx }),

  getNodeMetrics: (ctx: ResourceContext) => invoke<NodeMetric[]>("get_node_metrics", { ctx }),

  listHelmReleases: (context: string) =>
    invoke<HelmReleaseSummary[]>("list_helm_releases", { context }),

  getHelmRelease: (context: string, name: string) =>
    invoke<HelmReleaseDetail>("get_helm_release", { context, name }),

  getHelmReleaseRevision: (context: string, name: string, version: number) =>
    invoke<HelmReleaseDetail>("get_helm_release_revision", { context, name, version }),

  listHelmRevisions: (context: string, name: string) =>
    invoke<HelmReleaseRevision[]>("list_helm_revisions", { context, name }),

  uninstallHelmRelease: (context: string, name: string) =>
    invoke<void>("uninstall_helm_release", { context, name }),
};

/**
 * Subscribes to backend watch events for a subscription id.
 * Returns an unlisten function.
 */
export function subscribeWatch(
  id: string,
  onEvent: (event: WatchEvent) => void,
): Promise<UnlistenFn> {
  return listen<WatchEvent>(WATCH_EVENT, (event) => {
    if (event.payload.id === id) {
      onEvent(event.payload);
    }
  });
}

/** Subscribes to backend follow-log events for a subscription id. */
export function subscribeLogs(id: string, onEvent: (event: LogEvent) => void): Promise<UnlistenFn> {
  return listen<LogEvent>(LOG_EVENT, (event) => {
    if (event.payload.id === id) {
      onEvent(event.payload);
    }
  });
}

/** Subscribes to backend exec output events for a session id. */
export function subscribeExecOutput(
  id: string,
  onEvent: (event: ExecEvent) => void,
): Promise<UnlistenFn> {
  return listen<ExecEvent>(EXEC_EVENT, (event) => {
    if (event.payload.id === id) {
      onEvent(event.payload);
    }
  });
}
