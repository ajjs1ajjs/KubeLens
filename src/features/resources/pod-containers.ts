import type { K8sObject } from "@/lib/k8s/types";

/** Container names declared by a Pod's spec. */
export function podContainers(object: K8sObject): string[] {
  const spec = object.spec as Record<string, unknown> | undefined;
  const containers = (spec?.containers ?? []) as Record<string, unknown>[];
  return containers.map((c) => (typeof c.name === "string" ? c.name : "")).filter(Boolean);
}
