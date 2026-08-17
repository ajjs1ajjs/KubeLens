import type { K8sObject } from "./types";

export interface ObjectMetaData {
  name: string;
  namespace?: string;
  uid?: string;
  creationTimestamp?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

/** Extracts the Kubernetes `metadata` block from an object. */
export function meta(obj: K8sObject): ObjectMetaData {
  const m = (obj.metadata ?? {}) as Record<string, unknown>;
  return {
    name: typeof m.name === "string" ? m.name : "",
    namespace: typeof m.namespace === "string" ? m.namespace : undefined,
    uid: typeof m.uid === "string" ? m.uid : undefined,
    creationTimestamp: typeof m.creationTimestamp === "string" ? m.creationTimestamp : undefined,
    labels: (m.labels as Record<string, string>) ?? {},
    annotations: (m.annotations as Record<string, string>) ?? {},
  };
}

/** Stable identity for an object across watch updates. */
export function objectUid(obj: K8sObject): string {
  const m = meta(obj);
  return m.uid ?? `${m.namespace ?? ""}/${m.name}`;
}

/** Formats a Kubernetes creation timestamp as a compact age string. */
export function formatAge(timestamp?: string): string {
  if (!timestamp) return "—";
  const created = Date.parse(timestamp);
  if (Number.isNaN(created)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
}

/** Reads a JSON pointer like `/status/phase` from an object. */
export function readPath(obj: K8sObject, path: string): unknown {
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

/** Returns the ready/available replica summary, e.g. `2/3`. */
export function readyReplicas(obj: K8sObject): string | undefined {
  const status = obj.status as Record<string, unknown> | undefined;
  if (!status) return undefined;
  const ready = status.readyReplicas;
  const desired = status.replicas ?? status.desiredReplicas;
  if (typeof ready === "number" && typeof desired === "number") {
    return `${ready}/${desired}`;
  }
  return undefined;
}

/** Returns the Pod readiness summary, e.g. `2/3`, plus restart count. */
export function podSummary(obj: K8sObject): { ready?: string; restarts?: number } {
  const status = obj.status as Record<string, unknown> | undefined;
  const containerStatuses = (status?.containerStatuses ?? []) as Record<string, unknown>[];
  const ready = containerStatuses.filter((c) => c.ready === true).length;
  const restarts = containerStatuses.reduce((sum, c) => {
    const count = typeof c.restartCount === "number" ? c.restartCount : 0;
    return sum + count;
  }, 0);
  return {
    ready: containerStatuses.length > 0 ? `${ready}/${containerStatuses.length}` : undefined,
    restarts,
  };
}

/** Returns the node `Ready` condition boolean, if known. */
export function nodeReady(obj: K8sObject): boolean | undefined {
  const conditions = readPath(obj, "/status/conditions");
  if (!Array.isArray(conditions)) return undefined;
  const ready = conditions.find((c) => (c as Record<string, unknown>).type === "Ready") as
    Record<string, unknown> | undefined;
  if (!ready) return undefined;
  return ready.status === "True";
}

/** Returns node roles from its labels (`node-role.kubernetes.io/*`). */
export function nodeRoles(obj: K8sObject): string[] {
  const m = meta(obj);
  return Object.keys(m.labels)
    .filter((key) => key.startsWith("node-role.kubernetes.io/"))
    .map((key) => key.slice("node-role.kubernetes.io/".length));
}
