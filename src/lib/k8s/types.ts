/** A Kubernetes object as returned by the backend (full JSON manifest). */
export type K8sObject = Record<string, unknown>;

/** Kubeconfig context surfaced from the backend. */
export interface ClusterSummary {
  name: string;
  server: string;
  namespace: string | null;
  current: boolean;
  connected: boolean;
  version: string | null;
  error: string | null;
}

/** A user-managed cluster configuration (one kubeconfig file). */
export interface ClusterConfig {
  id: string;
  name: string;
  path: string;
  active: boolean;
  contexts: ClusterSummary[];
}

/** Identifies a resource set to query on the backend. */
export interface ResourceContext {
  context: string;
  /** Id of the cluster config this context belongs to (empty = active config). */
  configId?: string;
  group: string;
  version: string;
  kind: string;
  namespaced: boolean;
  namespace: string;
}

/** Event emitted by the backend for a watch subscription. */
export interface WatchEvent {
  id: string;
  action: "upsert" | "delete" | "init" | "init-done" | "error";
  object?: K8sObject;
  error?: string;
}

/** Event emitted by the backend for a follow-log subscription. */
export interface LogEvent {
  id: string;
  action: "line" | "done" | "error";
  line?: string;
  error?: string;
}

/** Event emitted by the backend for an exec terminal session. */
export interface ExecEvent {
  id: string;
  action: "output" | "done" | "error";
  data?: string;
  error?: string;
}

/** An active port-forward tunnel. */
export interface PortForwardInfo {
  id: string;
  context: string;
  name: string;
  remotePort: number;
  localPort: number;
}

/** Result of starting a port-forward tunnel. */
export interface PortForwardStart {
  id: string;
  localPort: number;
}

/** CPU/memory usage for a single container, from the metrics API. */
export interface ContainerMetric {
  name: string;
  cpuMillicores: number;
  memoryBytes: number;
}

/** CPU/memory usage snapshot for a Pod, from the metrics API. */
export interface PodMetric {
  namespace: string;
  name: string;
  cpuMillicores: number;
  memoryBytes: number;
  containers: ContainerMetric[];
}

/** CPU/memory usage snapshot for a Node, from the metrics API. */
export interface NodeMetric {
  name: string;
  cpuMillicores: number;
  memoryBytes: number;
}

/** A Helm release as read from the Helm storage backend. */
export interface HelmReleaseSummary {
  name: string;
  namespace: string;
  version: number;
  status: string;
  chart: string;
  chartVersion: string;
  appVersion: string;
  description: string;
  firstDeployed: string;
  lastDeployed: string;
}

/** Full detail of a Helm release. */
export interface HelmReleaseDetail extends HelmReleaseSummary {
  values: string;
  manifest: string;
  notes: string;
}

/** One stored revision of a Helm release. */
export interface HelmReleaseRevision {
  name: string;
  version: number;
  status: string;
  chart: string;
  chartVersion: string;
  lastDeployed: string;
}
