import type { K8sObject } from "@/lib/k8s/types";

export type TopologyNodeKind = "ingress" | "service" | "workload" | "configmap" | "secret" | "pvc";

export interface TopologyNode {
  /** Unique id, e.g. `Deployment:web`. */
  id: string;
  kind: TopologyNodeKind;
  name: string;
  namespace: string;
  /** The concrete Kubernetes kind, e.g. `Deployment`. */
  resourceKind: string;
  /** Layout column (left to right). */
  layer: number;
  /** Position after layout. */
  x: number;
  y: number;
}

export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  metrics: { width: number; height: number };
}

/** Kubernetes kinds treated as workload nodes. */
const WORKLOAD_KINDS = new Set([
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "ReplicaSet",
  "Job",
  "CronJob",
  "Pod",
]);

/** Resource kinds we know how to render in the graph. */
export function isSupportedKind(kind: string): boolean {
  if (WORKLOAD_KINDS.has(kind)) return true;
  return ["Service", "Ingress", "ConfigMap", "Secret", "PersistentVolumeClaim"].includes(kind);
}

function nodeKindFor(kind: string): TopologyNodeKind {
  if (WORKLOAD_KINDS.has(kind)) return "workload";
  switch (kind) {
    case "Service":
      return "service";
    case "Ingress":
      return "ingress";
    case "ConfigMap":
      return "configmap";
    case "Secret":
      return "secret";
    case "PersistentVolumeClaim":
      return "pvc";
    default:
      return "workload";
  }
}

function layerFor(kind: TopologyNodeKind): number {
  switch (kind) {
    case "ingress":
      return 0;
    case "service":
      return 1;
    case "workload":
      return 2;
    default:
      return 3;
  }
}

export interface ObjectMetaLike {
  name?: string;
  namespace?: string;
}

function objMeta(obj: K8sObject): ObjectMetaLike {
  return (obj.metadata ?? {}) as ObjectMetaLike;
}

/** Returns the pod-template labels for a workload, or null if not a workload. */
function workloadLabels(obj: K8sObject): Record<string, string> | null {
  const kind = typeof obj.kind === "string" ? obj.kind : "";
  if (!WORKLOAD_KINDS.has(kind)) return null;
  if (kind === "Pod") {
    const labels = read(obj, "/metadata/labels");
    if (labels && typeof labels === "object") {
      return labels as Record<string, string>;
    }
    return {};
  }
  const template = read(obj, "/spec/template/metadata/labels");
  if (template && typeof template === "object") {
    return template as Record<string, string>;
  }
  return {};
}

function read(obj: K8sObject, path: string): unknown {
  return path
    .split("/")
    .filter(Boolean)
    .reduce<unknown>(
      (current, segment) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[segment]
          : undefined,
      obj,
    );
}

/** Collects referenced ConfigMap/Secret/PVC names from a workload's pod spec. */
function workloadRefs(obj: K8sObject): {
  configMaps: Set<string>;
  secrets: Set<string>;
  pvcs: Set<string>;
} {
  const configMaps = new Set<string>();
  const secrets = new Set<string>();
  const pvcs = new Set<string>();

  const containers = (read(obj, "/spec/template/spec/containers") as K8sObject[]) ?? [];
  const initContainers = (read(obj, "/spec/template/spec/initContainers") as K8sObject[]) ?? [];
  for (const container of [...containers, ...initContainers]) {
    const envFrom = (container.envFrom as K8sObject[]) ?? [];
    for (const source of envFrom) {
      const cm = read(source, "/configMapRef/name");
      if (typeof cm === "string") configMaps.add(cm);
      const secret = read(source, "/secretRef/name");
      if (typeof secret === "string") secrets.add(secret);
    }
    const env = (container.env as K8sObject[]) ?? [];
    for (const item of env) {
      const cm = read(item, "/valueFrom/configMapKeyRef/name");
      if (typeof cm === "string") configMaps.add(cm);
      const secret = read(item, "/valueFrom/secretKeyRef/name");
      if (typeof secret === "string") secrets.add(secret);
    }
  }

  const volumes = (read(obj, "/spec/template/spec/volumes") as K8sObject[]) ?? [];
  for (const volume of volumes) {
    const cm = read(volume, "/configMap/name");
    if (typeof cm === "string") configMaps.add(cm);
    const secret = read(volume, "/secret/secretName");
    if (typeof secret === "string") secrets.add(secret);
    const pvc = read(volume, "/persistentVolumeClaim/claimName");
    if (typeof pvc === "string") pvcs.add(pvc);
  }

  return { configMaps, secrets, pvcs };
}

/** Backend service names referenced by an Ingress. */
function ingressBackends(obj: K8sObject): string[] {
  const names = new Set<string>();
  const defaultBackend = read(obj, "/spec/defaultBackend/service/name");
  if (typeof defaultBackend === "string") names.add(defaultBackend);
  const rules = (read(obj, "/spec/rules") as K8sObject[]) ?? [];
  for (const rule of rules) {
    const paths = (read(rule, "/http/paths") as K8sObject[]) ?? [];
    for (const path of paths) {
      const serviceName = read(path, "/backend/service/name");
      if (typeof serviceName === "string") names.add(serviceName);
    }
  }
  return [...names];
}

/** Service selector map, or empty when the service has no selector. */
function serviceSelector(obj: K8sObject): Record<string, string> {
  const selector = read(obj, "/spec/selector");
  if (selector && typeof selector === "object") {
    return selector as Record<string, string>;
  }
  return {};
}

function selectorMatches(
  selector: Record<string, string>,
  labels: Record<string, string>,
): boolean {
  return Object.entries(selector).every(([key, value]) => labels[key] === value);
}

/**
 * Builds the dependency graph from a flat list of Kubernetes objects.
 * Edges point from the dependent (consumer) to the dependency (provider):
 * Ingress → Service → Workload → ConfigMap/Secret/PVC.
 */
export function buildTopology(objects: K8sObject[]): TopologyGraph {
  const nodes = new Map<string, TopologyNode>();
  const byKindName = new Map<string, K8sObject>();

  for (const obj of objects) {
    const kind = typeof obj.kind === "string" ? obj.kind : "";
    if (!isSupportedKind(kind)) continue;
    const meta = objMeta(obj);
    const name = meta.name ?? "";
    if (!name) continue;
    const nodeKind = nodeKindFor(kind);
    const id = `${kind}:${name}`;
    byKindName.set(`${kind}:${name}`, obj);
    nodes.set(id, {
      id,
      kind: nodeKind,
      name,
      namespace: meta.namespace ?? "",
      resourceKind: kind,
      layer: layerFor(nodeKind),
      x: 0,
      y: 0,
    });
  }

  const edges: TopologyEdge[] = [];
  const addEdge = (from: string, to: string) => {
    if (!nodes.has(from) || !nodes.has(to)) return;
    const id = `${from}->${to}`;
    if (!edges.some((e) => e.id === id)) {
      edges.push({ id, from, to });
    }
  };

  // Ingress → Service
  for (const [, obj] of byKindName) {
    if (typeof obj.kind !== "string" || obj.kind !== "Ingress") continue;
    const key = `${obj.kind}:${objMeta(obj).name}`;
    for (const serviceName of ingressBackends(obj)) {
      addEdge(key, `Service:${serviceName}`);
    }
  }

  // Service → Workload (selector match)
  for (const [, obj] of byKindName) {
    if (typeof obj.kind !== "string" || obj.kind !== "Service") continue;
    const key = `${obj.kind}:${objMeta(obj).name}`;
    const selector = serviceSelector(obj);
    if (Object.keys(selector).length === 0) continue;
    for (const [wid, wobj] of byKindName) {
      const labels = workloadLabels(wobj);
      if (labels && selectorMatches(selector, labels)) {
        addEdge(key, wid);
      }
    }
  }

  // Workload → ConfigMap/Secret/PVC
  for (const [, obj] of byKindName) {
    if (typeof obj.kind !== "string" || !WORKLOAD_KINDS.has(obj.kind)) continue;
    const key = `${obj.kind}:${objMeta(obj).name}`;
    const refs = workloadRefs(obj);
    for (const cm of refs.configMaps) addEdge(key, `ConfigMap:${cm}`);
    for (const secret of refs.secrets) addEdge(key, `Secret:${secret}`);
    for (const pvc of refs.pvcs) addEdge(key, `PersistentVolumeClaim:${pvc}`);
  }

  return { nodes: [...nodes.values()], edges, metrics: { width: 0, height: 0 } };
}

export interface LayoutMetrics {
  width: number;
  height: number;
}

const LAYER_GAP = 180;
const ROW_GAP = 64;
const NODE_WIDTH = 140;
const NODE_HEIGHT = 36;

/**
 * Assigns x/y coordinates using a layered (left-to-right) layout: each kind
 * occupies a column, rows are spread vertically and centered.
 */
export function layoutTopology(graph: TopologyGraph): {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  metrics: LayoutMetrics;
} {
  const byLayer = new Map<number, TopologyNode[]>();
  for (const node of graph.nodes) {
    const layer = byLayer.get(node.layer) ?? [];
    layer.push(node);
    byLayer.set(node.layer, layer);
  }

  const positioned: TopologyNode[] = [];
  for (const [layer, layerNodes] of byLayer) {
    const sorted = [...layerNodes].sort((a, b) => a.name.localeCompare(b.name));
    const center = ((sorted.length - 1) / 2) * ROW_GAP;
    sorted.forEach((node, index) => {
      positioned.push({
        ...node,
        x: layer * LAYER_GAP,
        y: index * ROW_GAP - center,
      });
    });
  }

  const maxLayer = graph.nodes.reduce((m, n) => Math.max(m, n.layer), 0);
  const maxRows = Math.max(1, ...[...byLayer.values()].map((l) => l.length));
  const width = (maxLayer + 1) * LAYER_GAP + NODE_WIDTH;
  const height = Math.max(120, maxRows * ROW_GAP);

  return { nodes: positioned, edges: graph.edges, metrics: { width, height } };
}

/** Maps node kinds to a display color for the SVG. */
export function nodeKindColor(kind: TopologyNodeKind): string {
  switch (kind) {
    case "ingress":
      return "#8b5cf6";
    case "service":
      return "#0ea5e9";
    case "workload":
      return "#22c55e";
    case "configmap":
      return "#f59e0b";
    case "secret":
      return "#ef4444";
    case "pvc":
      return "#14b8a6";
  }
}

export { NODE_WIDTH, NODE_HEIGHT };
